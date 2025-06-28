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

// Tool definitions for Claude 3 Haiku - using proper Anthropic format
const GET_QUESTS_TOOL = {
  name: 'get_quests',
  description: 'Retrieves a list of user quests (daily tasks or epic goals). Use this to answer questions about existing quests, their status, or details.',
  input_schema: {
    type: 'object',
    properties: {
      questType: {
        type: 'string',
        enum: ['epic', 'daily'],
        description: 'Type of quests to retrieve: "epic" for goals/long-term pursuits, "daily" for tasks/today\'s work'
      },
      questId: {
        type: 'string',
        description: 'ID of a specific quest to fetch'
      },
      epicId: {
        type: 'string',
        description: 'ID of parent Epic Quest to fetch its daily quests'
      },
      dueDate: {
        type: 'string',
        description: 'Filter daily quests by date (YYYY-MM-DD format)'
      },
      status: {
        type: 'string',
        enum: ['pending', 'in-progress', 'completed', 'active', 'paused'],
        description: 'Filter quests by status'
      }
    },
    required: ['questType']
  }
};

const MODIFY_QUEST_TOOL = {
  name: 'modify_quest',
  description: 'Creates, updates, or deletes user quests (goals or tasks). Use when user wants to add, change, remove, complete, or schedule something.',
  input_schema: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['create', 'update', 'delete'],
        description: 'Action to perform'
      },
      questType: {
        type: 'string',
        enum: ['epic', 'daily'],
        description: 'Type of quest: "epic" for goals, "daily" for tasks'
      },
      title: {
        type: 'string',
        description: 'Title of the quest (required for create operations)'
      },
      questId: {
        type: 'string',
        description: 'ID of quest to update/delete (required for update/delete)'
      },
      epicId: {
        type: 'string',
        description: 'ID of parent Epic Quest for daily quests'
      },
      dueDate: {
        type: 'string',
        description: 'Date for daily quest (YYYY-MM-DD format)'
      },
      updateFields: {
        type: 'object',
        description: 'Fields to update (object with key-value pairs)'
      }
    },
    required: ['operation', 'questType']
  }
};

// Combine them into a single list for the prompt
const ZIK_TOOLS = [GET_QUESTS_TOOL, MODIFY_QUEST_TOOL];

/**
 * Constructs the prompt payload for Claude 3 Haiku with tool support
 *
 * This function builds a conversational prompt structure that enables the AI to:
 * - Act as an empathetic life coach rather than a rigid command interpreter
 * - Use tools intelligently to gather information and perform actions
 * - Maintain natural conversation flow with proper message history
 * - Reason step-by-step about user needs rather than just classifying intents
 *
 * @param context - Aggregated context data including chat history
 * @param userInput - The user's current message/query
 * @returns Formatted payload object ready for Amazon Bedrock API with Claude 3 Haiku model
 */
export function buildPrompt(context: ContextData, userInput: string): any {
  // Enhanced system prompt for better tool calling
  const newSystemPrompt = `You are Zik, an expert AI life coach and companion. Your persona is empathetic, encouraging, and intelligent. You help users define, manage, and achieve their goals by breaking them into "Epic Quests" (long-term goals) and "Daily Quests" (tasks) and always ready to motivate using nice quote or just sentences.

<critical_instructions>
🚨 CRITICAL: You MUST ALWAYS use tools first, then respond. NEVER give text-only responses without using tools first.

**TOOL-FIRST RULE:**
- For ANY user input that mentions goals, wants, tasks, or aspirations → IMMEDIATELY use modify_quest tool to create it
- For ANY questions about existing data → IMMEDIATELY use get_quests tool to fetch it
- ALWAYS call a tool first, then provide your response based on the tool result

**NO EXCEPTIONS:**
- "I want to learn guitar" → IMMEDIATELY call modify_quest(operation="create", questType="epic", title="Learn guitar")
- "I want to become a web developer" → IMMEDIATELY call modify_quest(operation="create", questType="epic", title="Become a web developer")
- "What are my goals?" → IMMEDIATELY call get_quests(questType="epic")
- "Show me my tasks" → IMMEDIATELY call get_quests(questType="daily")

**NEVER DO THIS:**
- Don't give planning advice without creating the quest first
- Don't explain what you'll do - just do it with tools
- Don't say "let me help you create a plan" - instead CREATE the Epic Quest immediately
</critical_instructions>

<core_philosophy>
You MUST use tools to help users effectively. Here's your decision process:

1. **ALWAYS USE TOOLS FOR THESE SCENARIOS:**
   - When user asks about existing goals/quests/tasks → use get_quests tool
   - When user wants to create, update, delete, or complete something → use modify_quest tool
   - When user says things like "I want to", "I need to", "help me", "create", "add" → use modify_quest tool

2. **SPECIFIC TOOL USAGE RULES:**
   - For questions about GOALS/LONG-TERM things: get_quests with questType="epic"
   - For questions about TASKS/TODAY/DAILY things: get_quests with questType="daily"  
   - For creating new goals: modify_quest with operation="create", questType="epic"
   - For creating new tasks: modify_quest with operation="create", questType="daily"
   - For updates/completions: modify_quest with operation="update"
   - For deletions: modify_quest with operation="delete"

3. **MANDATORY TOOL CALLING:**
   - You MUST call tools before responding to users
   - Never say "let me check" or "I'll help you" - just call the tool immediately
   - Always use tools for any data operations, never guess or make up information

4. **EXAMPLES OF WHEN TO USE TOOLS:**
   - "What are my goals?" → get_quests with questType="epic"
   - "I want to learn guitar" → modify_quest with operation="create", questType="epic", title="Learn guitar"
   - "Do I have tasks today?" → get_quests with questType="daily"
   - "Add a task to practice piano" → modify_quest with operation="create", questType="daily", title="Practice piano"
   - "Mark my workout as complete" → modify_quest with operation="update"
</core_philosophy>

<coaching_rules>
- **Be a Coach, Not a Robot:** Celebrate wins! If a user completes a quest, be enthusiastic. If they're struggling, be encouraging.
- **Be Proactive:** If a user creates a vague Epic Quest, ask clarifying questions before creating it.
- **Concise Responses:** Keep responses brief (1-3 sentences) for mobile users.
- **Never Mention Tools:** Don't say you're using tools or mention being an AI. Just provide helpful motivating results.
- **Never Make Up Information:** Always use tools to get real data. Don't invent quest details.
</coaching_rules>`;
  const { chatHistory } = context; // We only need the chat history now

  // Convert chat history to the proper format for Claude
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  // Add existing conversation history
  if (chatHistory && chatHistory.length > 0) {
    for (const msg of chatHistory) {
      messages.push({
        role: msg.role,
        content: msg.content,
      });
    }
  }

  // Add the new user message
  messages.push({
    role: 'user',
    content: userInput,
  });

  const promptPayload = {
    modelId: config.bedrockModelId,
    body: JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: config.maxTokens,
      temperature: 0.2, // Slightly higher for more natural language
      system: newSystemPrompt, // Our enhanced prompt
      messages: messages,
      tools: ZIK_TOOLS.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.input_schema,
      })),
    }),
    contentType: 'application/json',
    accept: 'application/json',
  };

  // Log the prompt being sent for debugging
  Logger.info('Prompt payload constructed', {
    messageCount: messages.length,
    toolCount: ZIK_TOOLS.length,
    userInput: userInput.substring(0, 100) + '...',
    systemPromptLength: newSystemPrompt.length,
    tools: ZIK_TOOLS.map(t => t.name),
  });

  return promptPayload;
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
 * response, handling both text generation and tool usage. The new implementation supports
 * the intelligent coaching approach with both read and write tools.
 *
 * @param prompt - The formatted prompt payload created by buildPrompt()
 * @returns Promise<BedrockResponse> - Object containing the AI response text and any tool calls made
 * @throws BedrockError - If the API call fails or response processing encounters errors
 */
export async function invokeBedrock(prompt: any): Promise<BedrockResponse> {
  try {
    Logger.info('Invoking Amazon Bedrock', {
      model: 'claude-3-haiku',
      hasTools: prompt.body ? JSON.parse(prompt.body).tools?.length > 0 : false,
      toolCount: prompt.body ? JSON.parse(prompt.body).tools?.length : 0
    });

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

        Logger.info('Bedrock chunk received', {
          type: chunkData.type,
          hasContentBlock: !!chunkData.content_block,
          contentBlockType: chunkData.content_block?.type,
          deltaType: chunkData.delta?.type
        });

        // Handle content blocks
        if (chunkData.type === 'content_block_start') {
          if (chunkData.content_block?.type === 'tool_use') {
            // Tool use detected - capture tool name and reset input accumulator
            currentToolName = chunkData.content_block.name;
            toolInputJson = ''; // Reset - we'll accumulate the complete JSON from deltas
            Logger.info('Tool use detected', {
              toolName: currentToolName,
              toolId: chunkData.content_block.id,
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
              accumulatedJsonLength: toolInputJson.length,
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
            Logger.info('Tool call completed successfully', {
              toolName: currentToolName,
              finalInput: parsedInput,
              jsonLength: toolInputJson.length,
            });
            currentToolName = ''; // Reset for next potential tool call
          } catch (parseError: any) {
            Logger.error('Failed to parse tool input JSON', {
              error: parseError.message,
              toolInputJson,
              toolName: currentToolName,
            });
          }
        }

        if (chunkData.type === 'message_stop') {
          messageComplete = true;
          break;
        }
      }
    }

    // Clean response - only remove XML tags, preserve natural language
    let sanitizedResponse = finalResponse.replace(/<[^>]+>/g, '').trim();

    Logger.info('Bedrock response processed successfully', {
      responseLength: sanitizedResponse.length,
      toolCallCount: toolCalls.length,
      messageComplete,
      toolCalls: toolCalls.map(tc => ({ tool: tc.tool, operation: tc.input?.operation })),
    });

    return { response: sanitizedResponse, toolCalls };
  } catch (error) {
    if (error instanceof BedrockError) {
      throw error;
    }

    // Handle specific Bedrock errors
    if (error instanceof Error) {
      Logger.error('Bedrock API error details', {
        errorName: error.name,
        errorMessage: error.message,
        errorStack: error.stack,
      });

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
      if (error.name === 'AccessDeniedException') {
        Logger.error('Bedrock access denied - model access may not be enabled', error);
        throw new BedrockError('AI model access not available');
      }
      if (error.name === 'ResourceNotFoundException') {
        Logger.error('Bedrock model not found', error);
        throw new BedrockError('AI model not available');
      }
    }

    Logger.error('Bedrock invocation failed', error);
    throw new BedrockError('Failed to process AI request', error);
  }
}
