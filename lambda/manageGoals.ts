import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { verifyTokenAndGetUserId } from '../src/services/authService';
import {
  fetchActiveGoals,
  createGoal,
  updateGoal,
  deleteGoal,
} from '../src/services/database/goals';
import {
  createSuccessResponse,
  createErrorResponse,
} from '../src/utils/responses';
import { Logger } from '../src/utils/logger';

/**
 * Lambda handler for Goals Management
 * Handles CRUD for Epic Quests (Goals) at /goals
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

    // Route by HTTP method and path
    const goalId = event.pathParameters?.goalId;
    switch (event.httpMethod) {
      case 'GET':
        return await handleGetGoals(userId, requestId);
      case 'POST':
        return await handleCreateGoal(event, userId, requestId);
      case 'PUT':
        if (!goalId) {
          return createErrorResponse(400, 'Missing goalId in path', requestId);
        }
        return await handleUpdateGoal(event, userId, goalId, requestId);
      case 'DELETE':
        if (!goalId) {
          return createErrorResponse(400, 'Missing goalId in path', requestId);
        }
        return await handleDeleteGoal(userId, goalId, requestId);
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

/**
 * Handle POST /goals - Create a new Epic Quest (goal)
 */
async function handleCreateGoal(
  event: APIGatewayProxyEvent,
  userId: string,
  requestId: string
): Promise<APIGatewayProxyResult> {
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const { title } = body;
    if (!title) {
      return createErrorResponse(400, 'Title is required', requestId);
    }
    const result = await createGoal(userId, title);
    Logger.info('Goal created successfully', { userId, title, requestId });
    return createSuccessResponse({ message: result }, requestId);
  } catch (error) {
    Logger.error('Failed to create goal', {
      userId,
      error: error instanceof Error ? error.message : 'Unknown error',
      requestId,
    });
    return createErrorResponse(500, 'Failed to create goal', requestId);
  }
}

/**
 * Handle PUT /goals/{goalId} - Update an Epic Quest (goal)
 */
async function handleUpdateGoal(
  event: APIGatewayProxyEvent,
  userId: string,
  goalId: string,
  requestId: string
): Promise<APIGatewayProxyResult> {
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    if (Object.keys(body).length === 0) {
      return createErrorResponse(400, 'No update fields provided', requestId);
    }
    const result = await updateGoal(userId, goalId, body);
    Logger.info('Goal updated successfully', { userId, goalId, requestId });
    return createSuccessResponse({ message: result }, requestId);
  } catch (error) {
    Logger.error('Failed to update goal', {
      userId,
      goalId,
      error: error instanceof Error ? error.message : 'Unknown error',
      requestId,
    });
    return createErrorResponse(500, 'Failed to update goal', requestId);
  }
}

/**
 * Handle DELETE /goals/{goalId} - Delete an Epic Quest (goal)
 */
async function handleDeleteGoal(
  userId: string,
  goalId: string,
  requestId: string
): Promise<APIGatewayProxyResult> {
  try {
    const result = await deleteGoal(userId, goalId);
    Logger.info('Goal deleted successfully', { userId, goalId, requestId });
    return createSuccessResponse({ message: result }, requestId);
  } catch (error) {
    Logger.error('Failed to delete goal', {
      userId,
      goalId,
      error: error instanceof Error ? error.message : 'Unknown error',
      requestId,
    });
    return createErrorResponse(500, 'Failed to delete goal', requestId);
  }
}
