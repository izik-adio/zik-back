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

// NEW: "Read" tool for fetching quests
const GET_QUESTS_TOOL = {
  name: 'get_quests',
  description:
    "Retrieves a list of a user's quests (daily or epic). Use this to answer any questions about what quests a user has, their status, or their details.",
  parameters: {
    type: 'object',
    properties: {
      questType: {
        type: 'string',
        enum: ['epic', 'daily'],
        description: 'The type of quests to retrieve - use "epic" for goals/long-term pursuits, "daily" for tasks/today\'s work',
      },
      questId: {
        type: 'string',
        description: 'The ID of a specific quest to fetch.',
      },
      epicId: {
        type: 'string',
        description: 'The ID of a parent Epic Quest to fetch its daily quests.',
      },
      dueDate: {
        type: 'string',
        description: 'Filter daily quests by a specific date (YYYY-MM-DD). Use today\'s date for "today" queries.',
      },
      status: {
        type: 'string',
        enum: ['pending', 'in-progress', 'completed', 'active', 'paused'],
        description: 'Filter quests by their status',
      },
    },
    required: ['questType'], // questType is now required to make tool calls clearer
  },
};

// RENAMED & REFINED: The "Write" tool
const MODIFY_QUEST_TOOL = {
  name: 'modify_quest',
  description:
    "Creates, updates, or deletes a user's quest (daily or epic). Use this ONLY when the user explicitly asks to add, change, remove, complete, or schedule something.",
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
  // NEW: The "Coach" System Prompt
  const newSystemPrompt = `
<role>
You are Zik, an expert AI life coach and companion. Your persona is empathetic, encouraging, and intelligent. You help users define, manage, and achieve their goals by breaking them into "Epic Quests" (long-term goals) and "Daily Quests" (tasks).
</role>

<core_philosophy>
You must use tools to help users effectively. Here's your decision process:

1. **ANALYZE THE REQUEST:** 
   - If user asks about their existing goals/quests/tasks (e.g., "What are my goals?", "Do I have tasks today?", "Show me my progress"), you MUST call the 'get_quests' tool first.
   - If user asks to create, update, delete, or complete something, you MUST call the 'modify_quest' tool.

2. **TOOL USAGE RULES:**
   - For questions about GOALS/LONG-TERM things: call get_quests with questType="epic"
   - For questions about TASKS/TODAY/DAILY things: call get_quests with questType="daily"
   - For creation/modification requests: call modify_quest with appropriate parameters

3. **RESPONSE PATTERN:**
   - Call the tool first
   - Then provide a helpful response based on the tool result
   - Never say "let me check" or "I'll look up" - just use the tool immediately
</core_philosophy>

<rules>
- **Be a Coach, Not a Robot:** Celebrate wins! If a user completes a quest, say "Awesome job!" or "Great work!". If they are struggling, be encouraging and offer to help break the task down.
- **Be Proactive:** If a user creates a vague Epic Quest, ask clarifying questions to make it more specific (e.g., "That's a great goal! By when would you like to achieve it?").
- **Concise Responses:** Keep your final text responses to the user brief (1-3 sentences). The user is on a mobile app.
- **Clarity is Key:** Never mention your tools or the fact that you are an AI. Just provide the helpful result.
- **Never Make Up Information:** If you don't know the answer, say so or use your tools to find it. Do not invent quest details.
</rules>
`;
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

  return {
    modelId: config.bedrockModelId,
    body: JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: config.maxTokens,
      temperature: 0.2, // Slightly higher for more natural language
      system: newSystemPrompt, // Our new, powerful prompt
      messages: messages,
      tools: ZIK_TOOLS.map((tool) => ({
        // Use the new toolset
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
 * response, handling both text generation and tool usage. The new implementation supports
 * the intelligent coaching approach with both read and write tools.
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

    // Clean response - only remove XML tags, preserve natural language
    let sanitizedResponse = finalResponse.replace(/<[^>]+>/g, '').trim();

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
