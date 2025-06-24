/**
 * Lean orchestrator for the Zik chat handler
 * This handler coordinates between services to process user chat requests
 */
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { randomUUID } from 'crypto';

// Service imports
import { verifyTokenAndGetUserId } from '../../services/authService';
import { buildPrompt, invokeBedrock } from '../../services/bedrockService';
import {
  getContextForUser,
  saveChatMessage,
} from '../../services/database/chatMessages';
import { executeTool } from '../../services/toolExecutor';

// Utility imports
import { Logger } from '../../utils/logger';
import {
  createSuccessResponse,
  createErrorResponse,
} from '../../utils/responses';
import {
  ValidationError,
  AuthError,
  BedrockError,
  DatabaseError,
  NotFoundError,
} from '../../utils/errors';
import { config } from '../../config';
import { ChatRequest, ToolInput } from '../../types';

/**
 * Helper functions for API Gateway event compatibility
 */
const getHttpMethod = (event: APIGatewayProxyEvent): string => {
  return event.httpMethod || (event as any).requestContext?.http?.method;
};

const getAuthorizationHeader = (
  event: APIGatewayProxyEvent
): string | undefined => {
  const headers = event.headers || {};
  return headers.Authorization || headers.authorization;
};

/**
 * Validates HTTP request and extracts user message
 * @param event - API Gateway event
 * @returns Promise<ChatRequest> - Object containing userId and userMessage
 * @throws ValidationError - If request validation fails
 * @throws AuthError - If authentication fails
 */
async function validateRequest(
  event: APIGatewayProxyEvent
): Promise<ChatRequest> {
  const httpMethod = getHttpMethod(event);

  // Only handle POST requests for chat
  if (httpMethod !== 'POST') {
    throw new ValidationError(
      'Method not allowed. Only POST requests are supported.'
    );
  }

  // Get and validate authorization header, then extract userId
  const authHeader = getAuthorizationHeader(event);
  const userId = await verifyTokenAndGetUserId(authHeader);

  // Parse request body
  let requestBody;
  try {
    requestBody = JSON.parse(event.body || '{}');
  } catch (error) {
    throw new ValidationError('Invalid JSON in request body');
  }

  const userMessage = requestBody.message;

  if (!userMessage || typeof userMessage !== 'string') {
    throw new ValidationError('Missing or invalid message field');
  }

  if (userMessage.length > config.maxMessageLength) {
    throw new ValidationError(
      `Message too long. Maximum ${config.maxMessageLength} characters allowed.`
    );
  }

  return { userId, userMessage };
}

/**
 * Main Lambda handler function for Zik AI chat interactions
 *
 * This is the primary entry point for all chat requests to the Zik AI assistant.
 * It orchestrates the complete chat flow including:
 * 1. Request validation and user authentication
 * 2. Context gathering (user profile, goals, tasks, chat history)
 * 3. AI prompt construction and Bedrock invocation
 * 4. Tool execution with comprehensive guardrails
 * 5. Response formatting and chat history persistence
 *
 * The function implements multiple layers of validation and error handling
 * to ensure secure and reliable AI interactions.
 *
 * @param event - API Gateway proxy event containing the HTTP request
 * @returns Promise<APIGatewayProxyResult> - Standardized HTTP response with CORS headers
 * @throws ValidationError - For malformed requests or invalid input
 * @throws AuthError - For authentication/authorization failures
 * @throws BedrockError - For AI service communication issues
 * @throws DatabaseError - For data persistence failures
 */
export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const requestId = randomUUID();

  Logger.info('Chat session started', {
    requestId,
    method: getHttpMethod(event),
    userAgent: event.headers?.['User-Agent'] || 'unknown',
  });

  try {
    // Step 1: Validate request and authenticate user
    const { userId, userMessage } = await validateRequest(event);

    Logger.info('Request validated', {
      requestId,
      userId,
      messageLength: userMessage.length,
    });

    // Step 2: Fetch all required context in parallel
    const context = await getContextForUser(userId);

    // Step 3: Build the prompt for Bedrock
    const fullPrompt = buildPrompt(context, userMessage);

    // Step 4: Invoke Bedrock and process response
    const { response: bedrockTextResponse, toolCalls } = await invokeBedrock(
      fullPrompt
    );

    // Step 5: Save user message to chat history
    await saveChatMessage(userId, 'user', userMessage);
    let finalResponse = ''; // Step 6: Handle tool execution with validation guardrails
    if (toolCalls && toolCalls.length > 0) {
      try {
        // *** IMPLEMENT BACKEND GUARDRAILS ***
        const validatedToolCalls: Array<{ tool: string; input: ToolInput }> =
          [];

        for (const call of toolCalls) {
          // GUARDRAIL 1: Check for the non-existent 'read' operation (even though TS prevents it)
          // This is a runtime safety check in case the AI somehow bypasses type constraints
          if ((call.input as any).operation === 'read') {
            Logger.warn(
              'AI attempted to use a non-existent "read" operation. Blocking tool call.',
              {
                requestId,
                userId,
                attemptedOperation: (call.input as any).operation,
                toolCall: JSON.stringify(call),
              }
            );
            // Do not add this call to the execution list
            continue; // Skip to the next tool call
          }

          // GUARDRAIL 2: Validate required fields are present
          if (!call.input.operation || !call.input.questType) {
            Logger.warn(
              'AI attempted tool call with missing required fields. Blocking tool call.',
              {
                requestId,
                userId,
                operation: call.input.operation,
                questType: call.input.questType,
                toolCall: JSON.stringify(call),
              }
            );
            continue; // Skip invalid tool calls
          }

          // GUARDRAIL 3: Validate operation is one of the allowed values
          const allowedOperations: Array<ToolInput['operation']> = [
            'create',
            'update',
            'delete',
          ];
          if (!allowedOperations.includes(call.input.operation)) {
            Logger.warn(
              'AI attempted tool call with invalid operation. Blocking tool call.',
              {
                requestId,
                userId,
                attemptedOperation: call.input.operation,
                allowedOperations,
                toolCall: JSON.stringify(call),
              }
            );
            continue; // Skip invalid operations
          }

          // GUARDRAIL 4: Validate questType is one of the allowed values
          const allowedQuestTypes: Array<ToolInput['questType']> = [
            'epic',
            'daily',
          ];
          if (!allowedQuestTypes.includes(call.input.questType)) {
            Logger.warn(
              'AI attempted tool call with invalid questType. Blocking tool call.',
              {
                requestId,
                userId,
                attemptedQuestType: call.input.questType,
                allowedQuestTypes,
                toolCall: JSON.stringify(call),
              }
            );
            continue; // Skip invalid quest types
          }

          // GUARDRAIL 5: Validate tool name
          if (call.tool !== 'manage_quest') {
            Logger.warn(
              'AI attempted to call unknown tool. Blocking tool call.',
              {
                requestId,
                userId,
                attemptedTool: call.tool,
                toolCall: JSON.stringify(call),
              }
            );
            continue; // Skip unknown tools
          }

          // If we reach here, the tool call passed all guardrails
          validatedToolCalls.push(call);
        }

        // *** ONLY EXECUTE VALIDATED TOOL CALLS ***
        if (validatedToolCalls.length > 0) {
          // CURRENTLY, WE ONLY SUPPORT ONE TOOL CALL PER TURN
          const firstValidToolCall = validatedToolCalls[0];

          Logger.info('Processing validated tool execution', {
            requestId,
            userId,
            tool: firstValidToolCall.tool,
            operation: firstValidToolCall.input?.operation,
            originalToolCallCount: toolCalls.length,
            validatedToolCallCount: validatedToolCalls.length,
            rawToolCall: JSON.stringify(firstValidToolCall),
            toolCallInput: JSON.stringify(firstValidToolCall.input),
          });

          const confirmationMessage = await executeTool(
            userId,
            firstValidToolCall.input
          );
          finalResponse = confirmationMessage;

          Logger.info('Tool execution completed', { requestId, userId });
        } else {
          // All tool calls were blocked by guardrails
          Logger.warn('All tool calls were blocked by validation guardrails', {
            requestId,
            userId,
            originalToolCallCount: toolCalls.length,
            blockedToolCalls: toolCalls.map((call) => ({
              tool: call.tool,
              operation: call.input?.operation,
              questType: call.input?.questType,
            })),
          });

          // Fall back to the text response from Bedrock
          finalResponse =
            bedrockTextResponse ||
            "I understand what you're asking, but I need more specific information to help you. Could you please rephrase your request?";
        }
      } catch (error) {
        Logger.error('Tool execution failed', error, { requestId, userId });

        if (error instanceof ValidationError) {
          finalResponse = `I had trouble with your request: ${error.message} Please try rephrasing it! 😅`;
        } else if (error instanceof NotFoundError) {
          finalResponse =
            "I couldn't find that quest. Please check the quest details and try again! 🔍";
        } else {
          finalResponse =
            'I had trouble processing your request. Please try again! 😅';
        }
      }
    } else {
      // Regular text response
      finalResponse = bedrockTextResponse;
    }

    // Step 7: Save assistant response to chat history
    await saveChatMessage(userId, 'assistant', finalResponse);

    Logger.info('Chat session completed successfully', {
      requestId,
      userId,
      responseLength: finalResponse.length,
      hadToolCall: !!(toolCalls && toolCalls.length > 0),
    });

    return createSuccessResponse(
      {
        response: finalResponse,
      },
      requestId
    );
  } catch (error) {
    Logger.error('Chat session failed', error, { requestId });

    // Handle different error types with appropriate HTTP status codes
    if (error instanceof ValidationError) {
      const statusCode = error.message.includes('Authorization') ? 401 : 400;
      return createErrorResponse(statusCode, error.message, requestId);
    }

    if (error instanceof AuthError) {
      return createErrorResponse(401, error.message, requestId);
    }

    if (error instanceof BedrockError) {
      return createErrorResponse(
        503,
        'AI service temporarily unavailable. Please try again later.',
        requestId
      );
    }

    if (error instanceof DatabaseError) {
      return createErrorResponse(
        500,
        'Database operation failed. Please try again later.',
        requestId
      );
    }

    // Generic server error for unexpected issues
    return createErrorResponse(
      500,
      'An unexpected error occurred. Please try again later.',
      requestId
    );
  }
}
