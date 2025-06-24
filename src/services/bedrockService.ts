/**
 * Amazon Bedrock service for AI interactions
 */
import {
  BedrockRuntimeClient,
  InvokeModelWithResponseStreamCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { config } from '../config';
import { ContextData, BedrockResponse, ToolInput } from '../types';
import { BedrockError } from '../utils/errors';
import { Logger } from '../utils/logger';

// AWS Bedrock client
const bedrockClient = new BedrockRuntimeClient({
  region: config.bedrockRegion,
});

// Tool Schema Definition for manage_quest (Bedrock format)
const MANAGE_QUEST_TOOLS = [
  {
    name: 'manage_quest',
    description:
      "Manages a user's goals ('Epic Quests') and daily tasks ('Daily Quests'). Use this to create, update, or delete any goal or task. Do not use for general conversation.",
    parameters: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          description: 'The action to perform.',
          enum: ['create', 'update', 'delete'],
        },
        questType: {
          type: 'string',
          description: 'The type of entity to manage.',
          enum: ['epic', 'daily'],
        },
        title: {
          type: 'string',
          description: "The title of the quest. Required for 'create'.",
        },
        questId: {
          type: 'string',
          description:
            "The unique ID of the quest to update or delete. Required for 'update' and 'delete'.",
        },
        epicId: {
          type: 'string',
          description:
            "The ID of the parent 'Epic Quest' this daily quest belongs to.",
        },
        dueDate: {
          type: 'string',
          description: 'The date for a daily quest in YYYY-MM-DD format.',
        },
        recurrenceRule: {
          type: 'string',
          description:
            "A simplified rule for recurring tasks, e.g., 'daily', 'weekdays', 'weekly'.",
        },
        updateFields: {
          type: 'object',
          description:
            "A JSON object of fields to change for an 'update' operation.",
        },
      },
      required: ['operation', 'questType'],
    },
  },
];

/**
 * Constructs the prompt payload for Claude 3 Haiku with tool support
 *
 * This function builds a comprehensive prompt structure that includes:
 * - System instructions for the Zik AI personality
 * - User context (profile, goals, tasks, chat history)
 * - Current user message
 * - Tool definitions for quest management
 *
 * @param context - Aggregated context data including user profile, active goals, today's tasks, and chat history
 * @param userInput - The user's current message/query
 * @returns Formatted payload object ready for Amazon Bedrock API with Claude 3 Haiku model
 */
export function buildPrompt(context: ContextData, userInput: string): any {
  const { userProfile, activeGoals, todayTasks, chatHistory } = context;

  // 1. Define the Golden System Prompt
  const goldenSystemPrompt = `
<role>
You are Zik, a friendly, proactive and expert AI life companion. Your persona is encouraging, concise, and direct.
</role>

<critical_task>
Your single most important task is to classify the user's intent into one of two categories: QUERY or ACTION. You must do this for every request.

1.  **QUERY Intent:** The user is asking for information, making a statement, or having a general conversation (including greetings).
    - **Keywords:** "what", "show", "list", "do I have", "tell me", "hi", "hello", "thanks", "morning".
    - **Your Instruction:** If the intent is QUERY, you **MUST** answer using **ONLY** the data provided in the \`<context_data>\` block of the user's message. **You MUST NOT use any tools.**

2.  **ACTION Intent:** The user is explicitly asking to create, modify, or delete data.
    - **Keywords:** "create", "add", "make", "update", "change", "delete", "remove".
    - **Your Instruction:** If the intent is ACTION, you **MUST** call the \`manage_quest\` tool to fulfill the request.

</critical_task>

<rules>
  - Your final text response must be extremely concise (1-2 sentences maximum).
  - Never explain what you are doing or mention the context. Just give the answer.
  - **CRITICAL:** Your classification of QUERY/ACTION is for internal reasoning only. **Do not** include the word "QUERY" or "ACTION" in your final response to the user.
  - Never invent tool operations like "read" or "list". The only valid operations are 'create', 'update', 'delete'.
  - Never include XML tags in your final output to the user.
</rules>
`;

  // 2. Format the context and history blocks in a simplified structure
  const contextAndHistory = `
<context_data>
    User: ${userProfile ? userProfile.firstName : 'N/A'}
    Active Goals: ${
      activeGoals.length > 0
        ? activeGoals
            .map((g) => `- ${g.goalName} (ID: ${g.goalId})`)
            .join('\n    ')
        : 'None'
    }
    Today's Tasks: ${
      todayTasks.length > 0
        ? todayTasks
            .map((t) => `- ${t.taskName} (ID: ${t.taskId})`)
            .join('\n    ')
        : 'None'
    }
    Chat History:
    ${
      chatHistory.length > 0
        ? chatHistory.map((m) => `${m.role}: ${m.content}`).join('\n    ')
        : 'None'
    }
</context_data>

<user_input>
    ${userInput}
</user_input>
`;

  // 3. Return the final, simplified payload
  return {
    modelId: config.bedrockModelId,
    body: JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: config.maxTokens,
      temperature: 0.1,
      system: goldenSystemPrompt, // The new, authoritative system prompt
      messages: [
        {
          role: 'user',
          content: contextAndHistory, // A simple block of data and the user's request
        },
      ],
      tools: MANAGE_QUEST_TOOLS.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.parameters,
      })),
    }),
    contentType: 'application/json',
    accept: 'application/json',
  };
}

/**
 * Invokes Amazon Bedrock and processes the response
 *
 * This function handles the entire lifecycle of invoking the Bedrock API and processing the response:
 * - Sending the prompt to Bedrock
 * - Streaming and assembling the response
 * - Parsing and structuring tool call outputs
 * - Error handling and logging
 *
 * @param prompt - The constructed prompt payload
 * @returns Promise<BedrockResponse> - Bedrock response data
 * @throws BedrockError - If Bedrock operation fails
 */
/**
 * Invokes Amazon Bedrock Claude 3 Haiku model with streaming response support
 *
 * This function sends the formatted prompt to Claude 3 Haiku and processes the streaming
 * response, handling both text generation and tool usage. It sanitizes the final response
 * to remove classification artifacts and provides structured tool call information.
 *
 * @param prompt - The formatted prompt payload created by buildPrompt()
 * @returns Promise<BedrockResponse> - Object containing the AI response text and any tool calls made
 * @throws BedrockError - If the API call fails or response processing encounters errors
 */
export async function invokeBedrock(prompt: any): Promise<BedrockResponse> {
  try {
    Logger.info('Invoking Amazon Bedrock', { model: 'claude-3-haiku' });

    const command = new InvokeModelWithResponseStreamCommand(prompt);
    const response = await bedrockClient.send(command);

    if (!response.body) {
      throw new BedrockError('No response body from Bedrock');
    }

    // Process streaming response for Claude 3 format
    let finalResponse = '';
    const toolCalls: { tool: string; input: ToolInput }[] = [];
    let messageComplete = false;
    let currentToolName = '';
    let toolInputJson = '';

    for await (const chunk of response.body) {
      if (chunk.chunk?.bytes) {
        const chunkData = JSON.parse(
          new TextDecoder().decode(chunk.chunk.bytes)
        );

        // Handle content blocks
        if (chunkData.type === 'content_block_start') {
          if (chunkData.content_block?.type === 'tool_use') {
            // Tool use detected - capture tool name and reset input accumulator
            currentToolName = chunkData.content_block.name;
            toolInputJson = ''; // Reset - we'll accumulate the complete JSON from deltas
            Logger.info('Tool use detected', {
              toolName: currentToolName,
              initialInput: chunkData.content_block.input,
            });
          }
        }

        if (chunkData.type === 'content_block_delta') {
          if (chunkData.delta?.type === 'text_delta') {
            finalResponse += chunkData.delta.text || '';
          } else if (chunkData.delta?.type === 'input_json_delta') {
            // Accumulate streaming tool input
            toolInputJson += chunkData.delta.partial_json || '';
            Logger.info('Tool input delta received', {
              partialJson: chunkData.delta.partial_json,
              accumulatedJson: toolInputJson,
            });
          }
        }

        if (chunkData.type === 'content_block_stop' && currentToolName) {
          // Complete tool input - parse the accumulated JSON
          try {
            const parsedInput = JSON.parse(toolInputJson);
            toolCalls.push({
              tool: currentToolName,
              input: parsedInput,
            });
            Logger.info('Tool call completed', {
              toolName: currentToolName,
              finalInput: parsedInput,
            });
            currentToolName = ''; // Reset for next potential tool call
          } catch (error) {
            Logger.error('Failed to parse tool input JSON', error, {
              toolInputJson,
            });
          }
        }

        if (chunkData.type === 'message_stop') {
          messageComplete = true;
          break;
        }
      }
    }

    // Production Guardrail: Sanitize the final response to remove any potential artifacts
    let sanitizedResponse = finalResponse.replace(/<[^>]+>/g, '').trim(); // Removes any XML tags
    sanitizedResponse = sanitizedResponse.replace(/^QUERY\s*/i, '').trim(); // Removes a leading "QUERY"
    sanitizedResponse = sanitizedResponse.replace(/^ACTION\s*/i, '').trim(); // Removes a leading "ACTION"

    // Additional cleanup for any other classification artifacts
    sanitizedResponse = sanitizedResponse
      .replace(/^\s*(QUERY|ACTION)\s*\n?/gi, '')
      .trim();

    Logger.info('Bedrock response processed', {
      responseLength: sanitizedResponse.length,
      toolCallCount: toolCalls.length,
      messageComplete,
    });

    return { response: sanitizedResponse, toolCalls };
  } catch (error) {
    if (error instanceof BedrockError) {
      throw error;
    }

    // Handle specific Bedrock errors
    if (error instanceof Error) {
      if (error.name === 'ThrottlingException') {
        Logger.error('Bedrock throttling detected', error);
        throw new BedrockError(
          'Service temporarily unavailable. Please try again later.'
        );
      }
      if (error.name === 'ValidationException') {
        Logger.error('Bedrock validation error', error);
        throw new BedrockError('Invalid request format');
      }
    }

    Logger.error('Bedrock invocation failed', error);
    throw new BedrockError('Failed to process AI request', error);
  }
}
