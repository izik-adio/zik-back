import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { verifyTokenAndGetUserId } from '../src/services/authService';
import {
  fetchTodayTasks,
  createTask,
  updateTask,
  deleteTask,
} from '../src/services/database/tasks';
import {
  createSuccessResponse,
  createErrorResponse,
} from '../src/utils/responses';
import { Logger } from '../src/utils/logger';

/**
 * Lambda handler for Tasks Management
 * Handles CRUD for Daily Tasks at /tasks
 */
export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const requestId = event.requestContext.requestId;
  Logger.info('Tasks handler invoked', {
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
    const taskId = event.pathParameters?.taskId;
    switch (event.httpMethod) {
      case 'GET':
        return await handleGetTasks(event, userId, requestId);
      case 'POST':
        return await handleCreateTask(event, userId, requestId);
      case 'PUT':
        if (!taskId) {
          return createErrorResponse(400, 'Missing taskId in path', requestId);
        }
        return await handleUpdateTask(event, userId, taskId, requestId);
      case 'DELETE':
        if (!taskId) {
          return createErrorResponse(400, 'Missing taskId in path', requestId);
        }
        return await handleDeleteTask(userId, taskId, requestId);
      default:
        Logger.warn('Method not allowed', {
          method: event.httpMethod,
          requestId,
        });
        return createErrorResponse(405, 'Method not allowed', requestId);
    }
  } catch (error) {
    Logger.error('Unhandled error in tasks handler', {
      error: error instanceof Error ? error.message : 'Unknown error',
      requestId,
    });
    return createErrorResponse(500, 'Internal server error', requestId);
  }
};

/**
 * Handle GET /tasks - Retrieve today's tasks or by date for the user
 */
async function handleGetTasks(
  event: APIGatewayProxyEvent,
  userId: string,
  requestId: string
): Promise<APIGatewayProxyResult> {
  try {
    // Support ?date=YYYY-MM-DD, default to today
    const date =
      event.queryStringParameters?.date ||
      new Date().toISOString().split('T')[0];
    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      return createErrorResponse(
        400,
        'Invalid date format. Expected YYYY-MM-DD',
        requestId
      );
    }
    // fetchTodayTasks only supports today, so fetch and filter if needed
    const allTasks = await fetchTodayTasks(userId);
    const tasks = allTasks.filter((task) => task.dueDate === date);
    Logger.info('Tasks retrieved successfully', {
      userId,
      date,
      count: tasks.length,
      requestId,
    });
    return createSuccessResponse({ tasks, count: tasks.length }, requestId);
  } catch (error) {
    Logger.error('Failed to fetch tasks', {
      userId,
      error: error instanceof Error ? error.message : 'Unknown error',
      requestId,
    });
    return createErrorResponse(500, 'Failed to retrieve tasks', requestId);
  }
}

/**
 * Handle POST /tasks - Create a new Daily Task
 */
async function handleCreateTask(
  event: APIGatewayProxyEvent,
  userId: string,
  requestId: string
): Promise<APIGatewayProxyResult> {
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const { title, dueDate, epicId } = body;
    if (!title) {
      return createErrorResponse(400, 'Title is required', requestId);
    }
    const result = await createTask(userId, title, dueDate, epicId);
    Logger.info('Task created successfully', {
      userId,
      title,
      dueDate,
      requestId,
    });
    return createSuccessResponse({ message: result }, requestId);
  } catch (error) {
    Logger.error('Failed to create task', {
      userId,
      error: error instanceof Error ? error.message : 'Unknown error',
      requestId,
    });
    return createErrorResponse(500, 'Failed to create task', requestId);
  }
}

/**
 * Handle PUT /tasks/{taskId} - Update a Daily Task
 */
async function handleUpdateTask(
  event: APIGatewayProxyEvent,
  userId: string,
  taskId: string,
  requestId: string
): Promise<APIGatewayProxyResult> {
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    if (Object.keys(body).length === 0) {
      return createErrorResponse(400, 'No update fields provided', requestId);
    }
    const result = await updateTask(userId, taskId, body);
    Logger.info('Task updated successfully', { userId, taskId, requestId });
    return createSuccessResponse({ message: result }, requestId);
  } catch (error) {
    Logger.error('Failed to update task', {
      userId,
      taskId,
      error: error instanceof Error ? error.message : 'Unknown error',
      requestId,
    });
    return createErrorResponse(500, 'Failed to update task', requestId);
  }
}

/**
 * Handle DELETE /tasks/{taskId} - Delete a Daily Task
 */
async function handleDeleteTask(
  userId: string,
  taskId: string,
  requestId: string
): Promise<APIGatewayProxyResult> {
  try {
    const result = await deleteTask(userId, taskId);
    Logger.info('Task deleted successfully', { userId, taskId, requestId });
    return createSuccessResponse({ message: result }, requestId);
  } catch (error) {
    Logger.error('Failed to delete task', {
      userId,
      taskId,
      error: error instanceof Error ? error.message : 'Unknown error',
      requestId,
    });
    return createErrorResponse(500, 'Failed to delete task', requestId);
  }
}
