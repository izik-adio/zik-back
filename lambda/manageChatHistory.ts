/**
 * Lambda handler for managing chat history
 * Supports READ and DELETE operations for user chat messages
 */
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { fetchChatHistory, cleanupUserChatHistory } from '../src/services/database/chatMessages';
import { verifyTokenAndGetUserId } from '../src/services/authService';
import { createSuccessResponse, createErrorResponse } from '../src/utils/responses';
import { Logger } from '../src/utils/logger';
import { ValidationError, DatabaseError } from '../src/utils/errors';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        Logger.info('Chat history request received', {
            method: event.httpMethod,
            path: event.path,
            resource: event.resource,
        });

        // Extract and verify JWT token
        const authHeader = event.headers.authorization || event.headers.Authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return createErrorResponse(401, 'Missing or invalid authorization header');
        }

        const userId = await verifyTokenAndGetUserId(authHeader);
        if (!userId) {
            return createErrorResponse(401, 'Invalid or expired token');
        }

        // Route by HTTP method (support both API Gateway v1 and v2 formats)
        const method = (event.requestContext as any)?.http?.method || event.requestContext?.httpMethod || event.httpMethod;

        switch (method) {
            case 'GET':
                return await handleGetChatHistory(userId, event);

            case 'DELETE':
                return await handleDeleteChatHistory(userId, event);

            default:
                return createErrorResponse(405, 'Method not allowed');
        }

    } catch (error) {
        Logger.error('Chat history handler error', error);

        if (error instanceof ValidationError) {
            return createErrorResponse(400, error.message);
        }

        if (error instanceof DatabaseError) {
            return createErrorResponse(500, 'Database operation failed');
        }

        return createErrorResponse(500, 'Internal server error');
    }
};

/**
 * Handle GET /chat-history - Fetch user's chat history
 * Simplified version - fetches all messages (max 10 due to database config)
 */
async function handleGetChatHistory(
    userId: string,
    event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
    try {
        // Fetch all chat history (will be limited to 10 messages by database config)
        const chatHistory = await fetchChatHistory(userId);

        Logger.info('Chat history fetched successfully', {
            userId,
            messageCount: chatHistory.length,
        });

        return createSuccessResponse({
            messages: chatHistory,
            count: chatHistory.length,
        });

    } catch (error) {
        Logger.error('Failed to fetch chat history', error, { userId });
        throw error;
    }
}

/**
 * Handle DELETE /chat-history - Clear user's chat history
 * Simplified version - clears all messages
 */
async function handleDeleteChatHistory(
    userId: string,
    event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
    try {
        // Clear all chat history (keep = 0)
        const deletedCount = await cleanupUserChatHistory(userId, 0);

        Logger.info('Chat history cleared successfully', {
            userId,
            deletedMessages: deletedCount,
        });

        return createSuccessResponse({
            deletedMessages: deletedCount,
            message: 'All chat history cleared',
        });

    } catch (error) {
        Logger.error('Failed to clear chat history', error, { userId });
        throw error;
    }
}
