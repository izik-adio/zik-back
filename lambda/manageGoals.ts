import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { verifyTokenAndGetUserId } from '../src/services/authService';
import { fetchActiveGoals } from '../src/services/database/goals';
import {
  createSuccessResponse,
  createErrorResponse,
} from '../src/utils/responses';

// Logger class from recovered code (until we fix the export)
const Logger = {
  info: (message: string, metadata?: any) =>
    console.log(JSON.stringify({ level: 'INFO', message, ...metadata })),
  warn: (message: string, metadata?: any) =>
    console.log(JSON.stringify({ level: 'WARN', message, ...metadata })),
  error: (message: string, metadata?: any) =>
    console.log(JSON.stringify({ level: 'ERROR', message, ...metadata })),
};

/**
 * Lambda handler for Goals Management
 * Handles GET /goals endpoint for retrieving Epic Quests
 */
export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const requestId = event.requestContext.requestId;
  Logger.info('Goals handler invoked', {
    method: event.httpMethod,
    path: event.path,
    requestId,
  });
  try {
    // Extract and verify JWT token
    const authHeader =
      event.headers.authorization || event.headers.Authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      Logger.warn('Missing or invalid authorization header', { requestId });
      return createErrorResponse(
        401,
        'Missing or invalid authorization header',
        requestId
      );
    }

    const userId = await verifyTokenAndGetUserId(authHeader);
    if (!userId) {
      Logger.warn('Token verification failed', { requestId });
      return createErrorResponse(401, 'Invalid or expired token', requestId);
    }

    Logger.info('User authenticated', { userId, requestId });

    // Handle HTTP methods
    switch (event.httpMethod) {
      case 'GET':
        return await handleGetGoals(userId, requestId);
      default:
        Logger.warn('Method not allowed', {
          method: event.httpMethod,
          requestId,
        });
        return createErrorResponse(405, 'Method not allowed', requestId);
    }
  } catch (error) {
    Logger.error('Unhandled error in goals handler', {
      error: error instanceof Error ? error.message : 'Unknown error',
      requestId,
    });
    return createErrorResponse(500, 'Internal server error', requestId);
  }
};

/**
 * Handle GET /goals - Retrieve all Epic Quests for the user
 */
async function handleGetGoals(
  userId: string,
  requestId: string
): Promise<APIGatewayProxyResult> {
  try {
    Logger.info('Fetching goals for user', { userId, requestId });

    const goals = await fetchActiveGoals(userId);

    const response = {
      goals: goals,
      count: goals.length,
    };

    Logger.info('Goals retrieved successfully', {
      userId,
      goalCount: goals.length,
      requestId,
    });

    return createSuccessResponse(response);
  } catch (error) {
    Logger.error('Failed to fetch goals', {
      userId,
      error: error instanceof Error ? error.message : 'Unknown error',
      requestId,
    });
    return createErrorResponse(500, 'Failed to retrieve goals', requestId);
  }
}
