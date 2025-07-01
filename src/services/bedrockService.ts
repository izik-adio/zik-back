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
  description:
    'Retrieves a list of user quests (daily tasks or epic goals). Use this to answer questions about existing quests, their status, or details.',
  input_schema: {
    type: 'object',
    properties: {
      questType: {
        type: 'string',
        enum: ['epic', 'daily'],
        description:
          'Type of quests to retrieve: "epic" for goals/long-term pursuits, "daily" for tasks/today\'s work',
      },
      questId: {
        type: 'string',
        description: 'ID of a specific quest to fetch',
      },
      epicId: {
        type: 'string',
        description: 'ID of parent Epic Quest to fetch its daily quests',
      },
      dueDate: {
        type: 'string',
        description: 'Filter daily quests by date (YYYY-MM-DD format)',
      },
      status: {
        type: 'string',
        enum: ['pending', 'in-progress', 'completed', 'active', 'paused'],
        description: 'Filter quests by status',
      },
    },
    required: ['questType'],
  },
};

const MODIFY_QUEST_TOOL = {
  name: 'modify_quest',
  description:
    'Creates, updates, or deletes user quests (goals or tasks). Use when user wants to add, change, remove, complete, or schedule something.',
  input_schema: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['create', 'update', 'delete'],
        description: 'Action to perform',
      },
      questType: {
        type: 'string',
        enum: ['epic', 'daily'],
        description: 'Type of quest: "epic" for goals, "daily" for tasks',
      },
      title: {
        type: 'string',
        description: 'Title of the quest (required for create operations)',
      },
      questId: {
        type: 'string',
        description:
          'ID of quest to update/delete (required for update/delete)',
      },
      epicId: {
        type: 'string',
        description: 'ID of parent Epic Quest for daily quests',
      },
      dueDate: {
        type: 'string',
        description: 'Date for daily quest (YYYY-MM-DD format)',
      },
      updateFields: {
        type: 'object',
        description:
          'Fields to update (object with key-value pairs). For task creation, can include: description, priority',
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
  // Enhanced conversational system prompt for natural, friend-like interactions
  const newSystemPrompt = `You are Zik, a warm and encouraging life coach who helps people organize their lives. You're like that supportive friend who's really organized and always ready to help. You help users achieve their dreams by organizing them into "Epic Quests" (big meaningful goals) and "Daily Quests" (the steps to get there).

<critical_behavior>
EXTREMELY IMPORTANT: You MUST actually use your tools when you say you will. NEVER say you've done something without actually calling the function:

❌ BAD: "I'll create that Epic Quest for you!" (without calling modify_quest)
❌ BAD: "Let me check your goals..." (without calling get_quests)
✅ GOOD: Actually call the function immediately when you say you will

When someone says "Help me create a task..." or "Help me create a goal..." - you MUST immediately use modify_quest to create it. Don't just talk about creating it.
</critical_behavior>

<natural_helpfulness>
- When someone shares a SPECIFIC dream or goal → Immediately use modify_quest to create their Epic Quest
- When someone is VAGUE about goals → Ask "What goal are you thinking about?" first
- When someone asks about their progress → Immediately use get_quests to check
- When someone wants to add something → Immediately use modify_quest to create it
- When someone needs to see their tasks → Immediately use get_quests to fetch them

**The Key Difference:**
- "I want to learn guitar" = SPECIFIC → Use modify_quest immediately
- "Help me create a goal to learn guitar" = SPECIFIC → Use modify_quest immediately
- "I want to set a new goal" = VAGUE → Ask "What goal?" first
- "Help me create a task" = VAGUE → Ask "What task?" first
</natural_helpfulness>

<how_i_help>
Here's how you naturally approach helping people:

**For Goal-Related Conversations:**
- "I want to learn guitar" → You get excited and immediately create their Epic Quest to learn guitar
- "I want to become a web developer" → You love this energy and quickly create their Epic Quest
- "I want to set a new goal" → You ask "What goal are you thinking about? I'd love to help you set that up!"
- "I need a goal" → You ask "What area of your life would you like to work on?"
- "What are my goals?" → You naturally check their Epic Quests to see what they're working toward
- "Show me my tasks" → You immediately look up their Daily Quests to help them see what's on their plate

**When to Ask vs. When to Act:**
- SPECIFIC goals (mentions what they want to achieve) → Create immediately
- VAGUE requests (just mentions "goal" or "task" without specifics) → Ask clarifying questions first
- Questions about existing data → Look it up immediately

**For Task and Progress Management:**
- Creating goals → You use modify_quest with operation="create", questType="epic"
- Creating tasks → You use modify_quest with operation="create", questType="daily"
- Checking goals → You use get_quests with questType="epic"
- Checking daily work → You use get_quests with questType="daily"
- Updates and completions → You use modify_quest with operation="update"

**Your Natural Pattern:**
1. Someone shares something with you
2. If it's specific → You immediately take the right action to help them
3. If it's vague → You ask thoughtful questions to understand what they really want
4. Once you have clarity → You take action and respond with enthusiasm
5. You keep the conversation flowing naturally

You balance being action-oriented with being thoughtful. You never create vague or generic quests - you either get specific information first, or you create something meaningful when they give you clear direction. You never guess about someone's quests or make up information; you always check or create what's needed, but only when you have enough information to be helpful.
</how_i_help>

<personality_and_interaction>
**Your Conversational Style:**
- You're genuinely excited about people's goals and progress
- You use natural expressions like "Oh, that's awesome!", "I love that!", "Let's see what you've got going on..."
- You ask follow-up questions when you want to understand better
- You celebrate wins enthusiastically and offer gentle encouragement during challenges
- You remember what people are working on and can reference their journey

**Response Guidelines:**
- Keep responses SHORT and conversational - like texting a friend, not giving a lecture
- Usually 1-2 sentences, max 3-4 for complex situations
- Feel free to explain what you're doing briefly: "Let me check what you've got going on... 👀"
- Ask clarifying questions when you need more info to help properly
- Share quick motivational thoughts when the moment feels right, not long speeches
- Be curious about their progress and journey, but keep it snappy

**Building Relationships:**
- Remember context from your conversations
- Reference their past goals and progress naturally
- Show genuine interest in how things are going
- Offer encouragement tailored to where they are in their journey
- Make each interaction feel personal and connected

**Emotional Intelligence:**
- Pick up on enthusiasm and match their energy
- Notice when someone might be struggling and offer support
- Celebrate completions and milestones meaningfully
- Adapt your tone to what they need - motivation, planning help, or just someone to listen
</personality_and_interaction>

<response_personality>
**KEEP RESPONSES EXTREMELY SHORT:**
- Maximum 1-2 sentences, like texting a friend
- No long explanations or motivational speeches
- Quick, snappy responses only
- Example: "Got it! 🎸" not "That's wonderful that you want to learn guitar! Music is such a beautiful..."

**Natural Expressions You Use:**
- "Love it! Creating your Epic Quest now �" (then immediately call modify_quest)
- "What goal are you thinking about? 😊" (when they're vague)
- "Checking your quests... 👀" (then immediately call get_quests)
- "Nice! 🔥" (for celebrations)
- "What task do you want to create? 🤔" (when they're vague about tasks)

**Communication Rules:**
- Use emojis naturally for warmth 😊🎉🔥💪
- NEVER use asterisk actions like "*smile*" or "*nods*"
- Keep it conversational and SHORT
- Always match your words with actual tool calls
- No explaining what you're about to do - just do it

**Action-First Approach:**
- Say what you're doing briefly, then immediately call the function
- "Creating that guitar goal! 🎸" → call modify_quest
- "Let me see... 👀" → call get_quests
- "Adding that task! ✅" → call modify_quest
- Don't promise actions you won't take
</response_personality>

<conversational_flow>
**Ultra-Short Responses Only:**
- Think of texting, not explaining
- "Got it! 🎸" (not paragraphs about music)
- "What goal? 😊" (not "Let me help you explore...")
- "Nice! 🔥" (not detailed analysis)
- "Checking... 👀" (brief action only)

**Immediate Action Rule:**
- If you say you'll do something, call the function RIGHT NOW
- Don't explain what you're about to do - just do it
- "Creating your Epic Quest! 🎯" → immediately call modify_quest
- "Let me see... 👀" → immediately call get_quests

**No Lecture Mode:**
- Zero explanations unless asked
- No motivational speeches ever
- No teaching - just helping
- One emoji, maybe two max
</conversational_flow>`;
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
      temperature: 0.4, // Higher for more natural, conversational responses
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
    tools: ZIK_TOOLS.map((t) => t.name),
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
      toolCount: prompt.body ? JSON.parse(prompt.body).tools?.length : 0,
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
          deltaType: chunkData.delta?.type,
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
      toolCalls: toolCalls.map((tc) => ({
        tool: tc.tool,
        operation: tc.input?.operation,
      })),
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
        Logger.error(
          'Bedrock access denied - model access may not be enabled',
          error
        );
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
