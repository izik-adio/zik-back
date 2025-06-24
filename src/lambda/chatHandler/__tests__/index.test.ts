/**
 * Integration tests for the chatHandler orchestrator
 * Tests the main handler function's orchestration logic with mocked services
 */
import { jest } from '@jest/globals';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { handler } from '../index';
import {
  ValidationError,
  AuthError,
  DatabaseError,
  BedrockError,
} from '../../../utils/errors';

// Mock all service modules
jest.mock('../../../services/authService', () => ({
  verifyTokenAndGetUserId: jest.fn(),
}));

jest.mock('../../../services/bedrockService', () => ({
  buildPrompt: jest.fn(),
  invokeBedrock: jest.fn(),
}));

jest.mock('../../../services/database/chatMessages', () => ({
  getContextForUser: jest.fn(),
  saveChatMessage: jest.fn(),
}));

jest.mock('../../../services/toolExecutor', () => ({
  executeTool: jest.fn(),
}));

// Mock logger
jest.mock('../../../utils/logger', () => ({
  Logger: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

// Mock config
jest.mock('../../../config', () => ({
  config: {
    maxMessageLength: 5000,
  },
}));

// Get mocked functions
const { verifyTokenAndGetUserId } = require('../../../services/authService');
const {
  buildPrompt,
  invokeBedrock,
} = require('../../../services/bedrockService');
const {
  getContextForUser,
  saveChatMessage,
} = require('../../../services/database/chatMessages');
const { executeTool } = require('../../../services/toolExecutor');

const mockVerifyToken = verifyTokenAndGetUserId as jest.MockedFunction<
  typeof verifyTokenAndGetUserId
>;
const mockBuildPrompt = buildPrompt as jest.MockedFunction<typeof buildPrompt>;
const mockInvokeBedrock = invokeBedrock as jest.MockedFunction<
  typeof invokeBedrock
>;
const mockGetContextForUser = getContextForUser as jest.MockedFunction<
  typeof getContextForUser
>;
const mockSaveChatMessage = saveChatMessage as jest.MockedFunction<
  typeof saveChatMessage
>;
const mockExecuteTool = executeTool as jest.MockedFunction<typeof executeTool>;

describe('ChatHandler Integration Tests', () => {
  const mockUserId = 'user-123';
  const mockRequestId = 'req-456';
  const validAuthHeader = 'Bearer valid-jwt-token';

  // Helper function to create mock API Gateway event
  const createMockEvent = (
    body: any,
    headers: Record<string, string> = {}
  ): APIGatewayProxyEvent => ({
    httpMethod: 'POST',
    path: '/chat',
    pathParameters: null,
    queryStringParameters: null,
    headers: {
      'Content-Type': 'application/json',
      Authorization: validAuthHeader,
      ...headers,
    },
    body: JSON.stringify(body),
    isBase64Encoded: false,
    requestContext: {
      requestId: mockRequestId,
      accountId: 'test-account',
      stage: 'test',
      apiId: 'test-api',
      resourceId: 'test-resource',
      resourcePath: '/chat',
      httpMethod: 'POST',
      path: '/chat',
      requestTime: '2025-06-23T10:00:00.000Z',
      requestTimeEpoch: 1719140400000,
      identity: {
        accessKey: null,
        accountId: null,
        apiKey: null,
        apiKeyId: null,
        caller: null,
        clientCert: null,
        cognitoAuthenticationProvider: null,
        cognitoAuthenticationType: null,
        cognitoIdentityId: null,
        cognitoIdentityPoolId: null,
        principalOrgId: null,
        sourceIp: '127.0.0.1',
        user: null,
        userAgent: 'test-agent',
        userArn: null,
      },
      protocol: 'HTTP/1.1',
      domainName: 'test.execute-api.us-east-1.amazonaws.com',
      domainPrefix: 'test',
      authorizer: {},
    },
    resource: '/chat',
    stageVariables: null,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
  });

  const mockUserContext = {
    userProfile: {
      userId: mockUserId,
      email: 'test@example.com',
      firstName: 'John',
      lastName: 'Doe',
    },
    activeGoals: [
      {
        goalId: 'goal-1',
        title: 'Learn Piano',
        status: 'active',
      },
    ],
    todayTasks: [
      {
        taskId: 'task-1',
        taskName: 'Practice scales',
        dueDate: '2025-06-23',
        status: 'pending',
      },
    ],
    chatHistory: [
      {
        messageId: 'msg-1',
        message: 'Hello',
        role: 'user',
        timestamp: '2025-06-23T09:00:00.000Z',
      },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Default mock implementations
    mockVerifyToken.mockResolvedValue(mockUserId);
    mockGetContextForUser.mockResolvedValue(mockUserContext); // Update the mock implementation since the actual function returns void
    mockSaveChatMessage.mockResolvedValue(undefined);
  });

  describe('Successful Text Response Scenario', () => {
    it('should handle simple text conversation successfully', async () => {
      const event = createMockEvent({
        message: 'Hello Zik, how are you?',
      });
      const mockPrompt = 'System prompt with context...';
      const mockBedrockResponse = {
        response:
          "Hello! I'm doing great, thank you for asking. How can I assist you today?",
        toolCall: undefined,
      };

      mockBuildPrompt.mockReturnValue(mockPrompt);
      mockInvokeBedrock.mockResolvedValue(mockBedrockResponse);

      const result = await handler(event);

      // Verify authentication was called
      expect(mockVerifyToken).toHaveBeenCalledWith(validAuthHeader);

      // Verify context was fetched
      expect(mockGetContextForUser).toHaveBeenCalledWith(mockUserId);

      // Verify prompt was built with correct data
      expect(mockBuildPrompt).toHaveBeenCalledWith(
        mockUserContext,
        'Hello Zik, how are you?'
      );

      // Verify Bedrock was invoked
      expect(mockInvokeBedrock).toHaveBeenCalledWith(mockPrompt);

      // Verify no tool execution occurred
      expect(mockExecuteTool).not.toHaveBeenCalled(); // Verify chat messages were saved
      expect(mockSaveChatMessage).toHaveBeenCalledTimes(2);
      expect(mockSaveChatMessage).toHaveBeenNthCalledWith(
        1,
        mockUserId,
        'user',
        'Hello Zik, how are you?'
      );
      expect(mockSaveChatMessage).toHaveBeenNthCalledWith(
        2,
        mockUserId,
        'assistant',
        mockBedrockResponse.response
      );

      // Verify response
      expect(result.statusCode).toBe(200);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.response).toBe(mockBedrockResponse.response);
      expect(responseBody.requestId).toBeDefined();
    });

    it('should handle empty active goals and tasks', async () => {
      const emptyContext = {
        ...mockUserContext,
        activeGoals: [],
        todayTasks: [],
      };

      mockGetContextForUser.mockResolvedValue(emptyContext);

      const event = createMockEvent({
        message: 'What should I do today?',
      });
      const mockBedrockResponse = {
        response:
          "It looks like you don't have any tasks scheduled for today. Would you like me to help you create some?",
        toolCall: undefined,
      };
      mockBuildPrompt.mockReturnValue('prompt with empty context');
      mockInvokeBedrock.mockResolvedValue(mockBedrockResponse);

      const result = await handler(event);
      expect(result.statusCode).toBe(200);
      expect(mockBuildPrompt).toHaveBeenCalledWith(
        emptyContext,
        'What should I do today?'
      );
      const responseBody = JSON.parse(result.body);
      expect(responseBody.response).toBe(mockBedrockResponse.response);
    });
  });

  describe('Successful Tool-Use Response Scenario', () => {
    it('should handle tool execution for creating a task', async () => {
      const event = createMockEvent({
        message: 'Create a task to practice piano for 30 minutes tomorrow',
      });
      const mockBedrockResponse = {
        response: `Here's what I can help you with today:

<tool_use>
{
  "operation": "create",
  "type": "task",
  "title": "Practice piano",
  "description": "Practice piano for 30 minutes",
  "dueDate": "2025-06-24",
  "priority": "medium"
}
</tool_use>

I'll create that task for you right now.`,
        toolCall: {
          tool: 'manage_quest',
          input: {
            operation: 'create',
            type: 'task',
            title: 'Practice piano',
            description: 'Practice piano for 30 minutes',
            dueDate: '2025-06-24',
            priority: 'medium',
          },
        },
      };

      const mockToolResult = {
        success: true,
        message:
          '✅ Task created successfully! "Practice piano" has been added to your schedule for tomorrow.',
        data: {
          taskId: 'task-new-123',
          taskName: 'Practice piano',
          dueDate: '2025-06-24',
        },
      };
      mockBuildPrompt.mockReturnValue('prompt for task creation');
      mockInvokeBedrock.mockResolvedValue(mockBedrockResponse);
      mockExecuteTool.mockResolvedValue(mockToolResult.message);

      const result = await handler(event);

      // Verify authentication and context fetching
      expect(mockVerifyToken).toHaveBeenCalledWith(validAuthHeader);
      expect(mockGetContextForUser).toHaveBeenCalledWith(mockUserId);

      // Verify Bedrock was invoked
      expect(mockInvokeBedrock).toHaveBeenCalledWith(
        'prompt for task creation'
      ); // Verify tool execution was called with parsed tool input
      expect(mockExecuteTool).toHaveBeenCalledWith(mockUserId, {
        operation: 'create',
        type: 'task',
        title: 'Practice piano',
        description: 'Practice piano for 30 minutes',
        dueDate: '2025-06-24',
        priority: 'medium',
      });

      // Verify messages were saved
      expect(mockSaveChatMessage).toHaveBeenCalledTimes(2);
      expect(mockSaveChatMessage).toHaveBeenNthCalledWith(
        1,
        mockUserId,
        'user',
        'Create a task to practice piano for 30 minutes tomorrow'
      );
      expect(mockSaveChatMessage).toHaveBeenNthCalledWith(
        2,
        mockUserId,
        'assistant',
        mockToolResult.message
      );

      // Verify response contains tool execution result
      expect(result.statusCode).toBe(200);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.response).toBe(mockToolResult.message);
      expect(responseBody.requestId).toBeDefined();
    });

    it('should handle tool execution for creating a goal', async () => {
      const event = createMockEvent({
        message: 'Create a new goal to learn Spanish this year',
      });
      const mockBedrockResponse = {
        response: `I'll help you create that goal!

<tool_use>
{
  "operation": "create",
  "type": "goal",
  "title": "Learn Spanish",
  "description": "Become conversational in Spanish within a year",
  "category": "education"
}
</tool_use>

Let me set that up for you.`,
        toolCall: {
          tool: 'manage_quest',
          input: {
            operation: 'create',
            type: 'goal',
            title: 'Learn Spanish',
            description: 'Become conversational in Spanish within a year',
            category: 'education',
          },
        },
      };

      const mockToolResult =
        '🎯 Epic Quest created! "Learn Spanish" has been added to your goals.';

      mockInvokeBedrock.mockResolvedValue(mockBedrockResponse);
      mockExecuteTool.mockResolvedValue(mockToolResult);

      const result = await handler(event);
      expect(mockExecuteTool).toHaveBeenCalledWith(mockUserId, {
        operation: 'create',
        type: 'goal',
        title: 'Learn Spanish',
        description: 'Become conversational in Spanish within a year',
        category: 'education',
      });

      expect(result.statusCode).toBe(200);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.response).toBe(mockToolResult);
    });

    it('should handle tool execution failure gracefully', async () => {
      const event = createMockEvent({
        message: 'Create a task for an invalid date',
      });
      const mockBedrockResponse = {
        response: `<tool_use>
{
  "operation": "create",
  "type": "task",
  "title": "Invalid task",
  "dueDate": "invalid-date"
}
</tool_use>`,
        toolCall: {
          tool: 'manage_quest',
          input: {
            operation: 'create',
            type: 'task',
            title: 'Invalid task',
            dueDate: 'invalid-date',
          },
        },
      };

      // The toolExecutor will throw a ValidationError, which gets caught and handled in the handler
      const mockError = new ValidationError('Invalid date format');

      mockInvokeBedrock.mockResolvedValue(mockBedrockResponse);
      mockExecuteTool.mockRejectedValue(mockError);
      const result = await handler(event);
      expect(mockExecuteTool).toHaveBeenCalled();
      expect(result.statusCode).toBe(200);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.response).toBe(
        'I had trouble with your request: Invalid date format Please try rephrasing it! 😅'
      );
    });
  });

  describe('Authentication Failure Scenario', () => {
    it('should return 401 when authorization header is missing', async () => {
      const event = createMockEvent(
        { message: 'Hello' },
        {} // No Authorization header
      );

      mockVerifyToken.mockRejectedValue(
        new ValidationError('Missing or invalid Authorization header')
      );

      const result = await handler(event);
      expect(result.statusCode).toBe(401);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.error).toBe(
        'Missing or invalid Authorization header'
      );
    });

    it('should return 401 when token is invalid', async () => {
      const event = createMockEvent(
        { message: 'Hello' },
        { Authorization: 'Bearer invalid-token' }
      );

      mockVerifyToken.mockRejectedValue(
        new AuthError('Invalid or expired token')
      );

      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.error).toBe('Invalid or expired token');
    });

    it('should return 401 when token is expired', async () => {
      const event = createMockEvent(
        { message: 'Hello' },
        { Authorization: 'Bearer expired-token' }
      );

      mockVerifyToken.mockRejectedValue(new AuthError('Token expired'));

      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.error).toBe('Token expired');
    });
  });

  describe('Database Failure Scenario', () => {
    it('should return 500 when context fetching fails', async () => {
      const event = createMockEvent({
        message: 'Hello',
      });

      mockGetContextForUser.mockRejectedValue(
        new DatabaseError('Failed to fetch user context')
      );

      const result = await handler(event);

      expect(mockVerifyToken).toHaveBeenCalled();
      expect(mockGetContextForUser).toHaveBeenCalledWith(mockUserId);
      expect(mockInvokeBedrock).not.toHaveBeenCalled();
      expect(result.statusCode).toBe(500);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.error).toBe(
        'Database operation failed. Please try again later.'
      );
    });

    it('should return 500 when chat message saving fails', async () => {
      const event = createMockEvent({
        message: 'Hello',
      });

      mockBuildPrompt.mockReturnValue('test prompt');
      mockInvokeBedrock.mockResolvedValue('Hello there!');
      mockSaveChatMessage.mockRejectedValueOnce(
        new DatabaseError('Failed to save chat message')
      );

      const result = await handler(event);
      expect(result.statusCode).toBe(500);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.error).toBe(
        'Database operation failed. Please try again later.'
      );
    });
  });

  describe('Bedrock Service Failure Scenario', () => {
    it('should return 500 when Bedrock invocation fails', async () => {
      const event = createMockEvent({
        message: 'Hello',
      });

      mockBuildPrompt.mockReturnValue('test prompt');
      mockInvokeBedrock.mockRejectedValue(
        new BedrockError('Model invocation failed')
      );

      const result = await handler(event);

      expect(mockVerifyToken).toHaveBeenCalled();
      expect(mockGetContextForUser).toHaveBeenCalled();
      expect(mockInvokeBedrock).toHaveBeenCalled();
      expect(result.statusCode).toBe(503);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.error).toBe(
        'AI service temporarily unavailable. Please try again later.'
      );
    });

    it('should return 500 when Bedrock returns invalid response', async () => {
      const event = createMockEvent({
        message: 'Hello',
      });

      mockBuildPrompt.mockReturnValue('test prompt');
      mockInvokeBedrock.mockResolvedValue(''); // Empty response

      const result = await handler(event);
      expect(result.statusCode).toBe(500);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.error).toBe(
        'An unexpected error occurred. Please try again later.'
      );
    });
  });

  describe('Request Validation Scenarios', () => {
    it('should return 400 for non-POST requests', async () => {
      const event = {
        ...createMockEvent({ message: 'Hello' }),
        httpMethod: 'GET',
      };

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.error).toBe(
        'Method not allowed. Only POST requests are supported.'
      );
    });

    it('should return 400 for missing message field', async () => {
      const event = createMockEvent({
        // Missing message field
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.error).toBe('Missing or invalid message field');
    });

    it('should return 400 for empty message', async () => {
      const event = createMockEvent({
        message: '',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.error).toBe('Missing or invalid message field');
    });

    it('should return 400 for non-string message', async () => {
      const event = createMockEvent({
        message: 123, // Non-string message
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.error).toBe('Missing or invalid message field');
    });

    it('should return 400 for message exceeding max length', async () => {
      const longMessage = 'A'.repeat(6000); // Exceeds maxMessageLength of 5000
      const event = createMockEvent({
        message: longMessage,
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.error).toBe(
        'Message too long. Maximum 5000 characters allowed.'
      );
    });

    it('should return 400 for invalid JSON body', async () => {
      const event = {
        ...createMockEvent({ message: 'Hello' }),
        body: '{ invalid json',
      };

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.error).toBe('Invalid JSON in request body');
    });
    it('should return 400 for null body', async () => {
      const event = {
        ...createMockEvent({ message: 'Hello' }),
        body: null,
      };

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.error).toBe('Missing or invalid message field');
    });
  });

  describe('Tool Parsing Edge Cases', () => {
    it('should handle malformed tool_use blocks', async () => {
      const event = createMockEvent({
        message: 'Create a task',
      });
      const malformedToolResponse = {
        response: `Here's a response with invalid tool use:

<tool_use>
{ invalid json: missing quotes }
</tool_use>

The tool block above is malformed.`,
        toolCall: undefined,
      };

      mockInvokeBedrock.mockRejectedValue(
        new BedrockError('Invalid tool call format in Bedrock response')
      );

      const result = await handler(event);

      // Should not attempt tool execution with malformed JSON
      expect(mockExecuteTool).not.toHaveBeenCalled();
      // Should return 503 error due to BedrockError
      expect(result.statusCode).toBe(503);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.error).toBe(
        'AI service temporarily unavailable. Please try again later.'
      );
    });

    it('should handle multiple tool_use blocks (only use first one)', async () => {
      const event = createMockEvent({
        message: 'Create multiple tasks',
      });
      const multipleToolResponse = {
        response: `I'll create two tasks for you:

<tool_use>
{
  "operation": "create",
  "type": "task",
  "title": "First task"
}
</tool_use>

<tool_use>
{
  "operation": "create",
  "type": "task",
  "title": "Second task"
}
</tool_use>

Both tasks will be created.`,
        toolCall: {
          tool: 'manage_quest',
          input: {
            operation: 'create',
            type: 'task',
            title: 'First task',
          },
        },
      };

      const mockToolResult = 'First task created successfully';

      mockInvokeBedrock.mockResolvedValue(multipleToolResponse);
      mockExecuteTool.mockResolvedValue(mockToolResult);

      const result = await handler(event);

      // Should only execute the first tool
      expect(mockExecuteTool).toHaveBeenCalledTimes(1);
      expect(mockExecuteTool).toHaveBeenCalledWith(mockUserId, {
        operation: 'create',
        type: 'task',
        title: 'First task',
      });

      expect(result.statusCode).toBe(200);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.response).toBe(mockToolResult);
    });
  });

  describe('Response Format Consistency', () => {
    it('should always return consistent response format', async () => {
      const event = createMockEvent({
        message: 'Test message',
      });

      mockInvokeBedrock.mockResolvedValue('Test response');

      const result = await handler(event);

      expect(result).toHaveProperty('statusCode');
      expect(result).toHaveProperty('headers');
      expect(result).toHaveProperty('body');

      // Check headers
      expect(result.headers).toMatchObject({
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers':
          'Content-Type,X-Amz-Date,Authorization,X-Api-Key',
        'Access-Control-Allow-Methods': 'POST,OPTIONS',
      });

      // Check body is valid JSON
      expect(() => JSON.parse(result.body)).not.toThrow();

      const responseBody = JSON.parse(result.body);
      expect(responseBody).toHaveProperty('timestamp');
    });
    it('should include requestId in responses when available', async () => {
      const event = createMockEvent({
        message: 'Test with request ID',
      });

      const mockBedrockResponse = {
        response: 'Response with request ID',
        toolCall: undefined,
      };

      mockInvokeBedrock.mockResolvedValue(mockBedrockResponse);

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.requestId).toBeDefined();
    });
  });
});
