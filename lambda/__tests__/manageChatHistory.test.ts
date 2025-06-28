/**
 * Tests for Chat History Management Lambda Handler
 */
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

// Mock the dependencies before importing the handler
jest.mock('../../src/services/database/chatMessages');
jest.mock('../../src/services/authService');

// Mock config
jest.mock('../../src/config', () => ({
    config: {
        defaultChatHistoryLimit: 10,
        maxChatHistoryPerUser: 10,
        chatHistoryRetentionDays: 30,
        userPoolId: 'us-east-1_test123',
        userPoolClientId: 'test-client-id',
        chatMessagesTableName: 'test-chat-table',
    },
}));

// Mock logger
jest.mock('../../src/utils/logger', () => ({
    Logger: {
        info: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
    },
}));

import { handler } from '../manageChatHistory';
import { fetchChatHistory, cleanupUserChatHistory } from '../../src/services/database/chatMessages';
import { verifyTokenAndGetUserId } from '../../src/services/authService';

const mockFetchChatHistory = fetchChatHistory as jest.MockedFunction<typeof fetchChatHistory>;
const mockCleanupUserChatHistory = cleanupUserChatHistory as jest.MockedFunction<typeof cleanupUserChatHistory>;
const mockVerifyTokenAndGetUserId = verifyTokenAndGetUserId as jest.MockedFunction<typeof verifyTokenAndGetUserId>;

describe('Chat History Management Lambda Handler', () => {
    const mockUserId = 'test-user-123';
    const mockAuthHeader = 'Bearer valid-jwt-token';

    beforeEach(() => {
        jest.clearAllMocks();
        mockVerifyTokenAndGetUserId.mockResolvedValue(mockUserId);
    });

    const createEvent = (method: string, queryParams?: Record<string, string>): APIGatewayProxyEvent => ({
        httpMethod: method,
        path: '/chat-history',
        resource: '/chat-history',
        headers: {
            authorization: mockAuthHeader,
        },
        queryStringParameters: queryParams || null,
        pathParameters: null,
        body: null,
        isBase64Encoded: false,
        requestContext: {} as any,
        multiValueHeaders: {},
        multiValueQueryStringParameters: null,
        stageVariables: null,
    });

    describe('GET /chat-history', () => {
        it('should fetch chat history successfully', async () => {
            const mockMessages = [
                {
                    userId: mockUserId,
                    timestamp: '2023-01-01T10:00:00.000Z',
                    messageId: 'msg-1',
                    role: 'user' as const,
                    content: 'Hello',
                },
                {
                    userId: mockUserId,
                    timestamp: '2023-01-01T10:01:00.000Z',
                    messageId: 'msg-2',
                    role: 'assistant' as const,
                    content: 'Hi there!',
                },
            ];

            mockFetchChatHistory.mockResolvedValue(mockMessages);

            const event = createEvent('GET');
            const result: APIGatewayProxyResult = await handler(event);

            expect(result.statusCode).toBe(200);
            expect(mockFetchChatHistory).toHaveBeenCalledWith(mockUserId, undefined);

            const responseBody = JSON.parse(result.body);
            expect(responseBody.messages).toEqual(mockMessages);
            expect(responseBody.count).toBe(2);
            expect(responseBody.timestamp).toBeDefined();
        });

        it('should use custom limit from query parameters', async () => {
            mockFetchChatHistory.mockResolvedValue([]);

            const event = createEvent('GET', { limit: '5' });
            const result: APIGatewayProxyResult = await handler(event);

            expect(result.statusCode).toBe(200);
            expect(mockFetchChatHistory).toHaveBeenCalledWith(mockUserId, 5);
        });

        it('should return 400 for invalid limit', async () => {
            const event = createEvent('GET', { limit: 'invalid' });
            const result: APIGatewayProxyResult = await handler(event);

            expect(result.statusCode).toBe(400);
            const responseBody = JSON.parse(result.body);
            expect(responseBody.error).toBeDefined();
            expect(responseBody.timestamp).toBeDefined();
        });

        it('should return 401 when authorization header is missing', async () => {
            const event = createEvent('GET');
            event.headers = {}; // Remove authorization header

            const result: APIGatewayProxyResult = await handler(event);

            expect(result.statusCode).toBe(401);
            const responseBody = JSON.parse(result.body);
            expect(responseBody.error).toBe('Missing or invalid authorization header');
            expect(responseBody.timestamp).toBeDefined();
        });
    });

    describe('DELETE /chat-history', () => {
        it('should clear all chat history successfully', async () => {
            mockCleanupUserChatHistory.mockResolvedValue(15);

            const event = createEvent('DELETE');
            const result: APIGatewayProxyResult = await handler(event);

            expect(result.statusCode).toBe(200);
            expect(mockCleanupUserChatHistory).toHaveBeenCalledWith(mockUserId, 0);

            const responseBody = JSON.parse(result.body);
            expect(responseBody.deletedMessages).toBe(15);
            expect(responseBody.keptMessages).toBe(0);
            expect(responseBody.message).toBe('All chat history cleared');
            expect(responseBody.timestamp).toBeDefined();
        });

        it('should clear chat history keeping specified messages', async () => {
            mockCleanupUserChatHistory.mockResolvedValue(10);

            const event = createEvent('DELETE', { keep: '5' });
            const result: APIGatewayProxyResult = await handler(event);

            expect(result.statusCode).toBe(200);
            expect(mockCleanupUserChatHistory).toHaveBeenCalledWith(mockUserId, 5);

            const responseBody = JSON.parse(result.body);
            expect(responseBody.deletedMessages).toBe(10);
            expect(responseBody.keptMessages).toBe(5);
            expect(responseBody.message).toBe('Cleared chat history, keeping last 5 messages');
            expect(responseBody.timestamp).toBeDefined();
        });

        it('should return 400 for invalid keep parameter', async () => {
            const event = createEvent('DELETE', { keep: '100' }); // Over limit

            const result: APIGatewayProxyResult = await handler(event);

            expect(result.statusCode).toBe(400);
            const responseBody = JSON.parse(result.body);
            expect(responseBody.error).toBeDefined();
            expect(responseBody.timestamp).toBeDefined();
        });
    });

    describe('Error handling', () => {
        it('should handle auth failures', async () => {
            mockVerifyTokenAndGetUserId.mockRejectedValue(new Error('Invalid token'));

            const event = createEvent('GET');
            const result: APIGatewayProxyResult = await handler(event);

            expect(result.statusCode).toBe(500);
            const responseBody = JSON.parse(result.body);
            expect(responseBody.error).toBe('Internal server error');
            expect(responseBody.timestamp).toBeDefined();
        });

        it('should handle unsupported methods', async () => {
            const event = createEvent('POST');
            const result: APIGatewayProxyResult = await handler(event);

            expect(result.statusCode).toBe(405);
            const responseBody = JSON.parse(result.body);
            expect(responseBody.error).toBe('Method not allowed');
            expect(responseBody.timestamp).toBeDefined();
        });

        it('should handle database errors', async () => {
            mockFetchChatHistory.mockRejectedValue(new Error('Database connection failed'));

            const event = createEvent('GET');
            const result: APIGatewayProxyResult = await handler(event);

            expect(result.statusCode).toBe(500);
            const responseBody = JSON.parse(result.body);
            expect(responseBody.error).toBe('Internal server error');
            expect(responseBody.timestamp).toBeDefined();
        });
    });
});
