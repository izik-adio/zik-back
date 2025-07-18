import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { verifyTokenAndGetUserId } from '../src/services/authService';
import {
  fetchTodayTasks,
  createTask,
  updateTask,
  deleteTask,
  getTaskById,
  fetchTasksByMilestone,
} from '../src/services/database/tasks';
import {
  getMilestonesByEpicId,
  getNextMilestone,
  updateMilestone,
} from '../src/services/database/milestones';
import { updateGoal } from '../src/services/database/goals';
import { generateDailyQuestsForMilestone } from '../src/services/stepFunctionService';
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
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> => {
  const requestId = event.requestContext.requestId;
  Logger.info('Tasks handler invoked', {
    method: event.requestContext?.http?.method,
    path: event.requestContext?.http?.path,
    pathParameters: event.pathParameters,
    queryStringParameters: event.queryStringParameters,
    headers: event.headers,
    requestId,
    eventRaw: JSON.stringify(event),
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
    const httpMethod = event.requestContext?.http?.method;
    switch (httpMethod) {
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
          method: httpMethod,
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
  event: APIGatewayProxyEventV2,
  userId: string,
  requestId: string
): Promise<APIGatewayProxyResultV2> {
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
  event: APIGatewayProxyEventV2,
  userId: string,
  requestId: string
): Promise<APIGatewayProxyResultV2> {
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const { title, dueDate, epicId, description } = body;
    if (!title) {
      return createErrorResponse(400, 'Title is required', requestId);
    }
    const result = await createTask(
      userId,
      title,
      dueDate,
      epicId,
      description
    );
    Logger.info('Task created successfully', {
      userId,
      title,
      dueDate,
      hasDescription: !!description,
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
  event: APIGatewayProxyEventV2,
  userId: string,
  taskId: string,
  requestId: string
): Promise<APIGatewayProxyResultV2> {
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    if (Object.keys(body).length === 0) {
      return createErrorResponse(400, 'No update fields provided', requestId);
    }
    const result = await updateTask(userId, taskId, body);
    Logger.info('Task updated successfully', { userId, taskId, requestId });

    // Check if this task was completed and if it triggers milestone progression
    if (body.status === 'completed') {
      await checkAndUpdateMilestoneCompletion(userId, taskId, requestId);
    }

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
): Promise<APIGatewayProxyResultV2> {
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

/**
 * Check and update milestone completion status based on task updates
 */
async function checkAndUpdateMilestoneCompletion(
  userId: string,
  taskId: string,
  requestId: string
) {
  try {
    // Fetch the updated task
    const task = await getTaskById(userId, taskId);
    if (!task || !task.milestoneId) {
      // Task is not part of a milestone, nothing to check
      return;
    }

    const { milestoneId, goalId } = task;

    if (!goalId) {
      Logger.warn('Task has milestoneId but no goalId', {
        taskId,
        milestoneId,
        requestId,
      });
      return;
    }

    // Get all tasks for this milestone
    const milestoneTasks = await fetchTasksByMilestone(userId, milestoneId);

    // Check if all tasks for this milestone are completed
    const pendingTasks = milestoneTasks.filter(
      (task) => task.status === 'pending' || task.status === 'in-progress'
    );

    if (pendingTasks.length === 0) {
      // All tasks for this milestone are completed!
      Logger.info('Milestone completed, triggering progression', {
        userId,
        milestoneId,
        goalId,
        requestId,
      });

      // Get all milestones for this epic to find the current sequence
      const milestones = await getMilestonesByEpicId(goalId);
      const currentMilestone = milestones.find(
        (m) => m.milestoneId === milestoneId
      );

      if (!currentMilestone) {
        Logger.error('Could not find current milestone', {
          milestoneId,
          goalId,
          requestId,
        });
        return;
      }

      // Mark current milestone as completed
      await updateMilestone(goalId, currentMilestone.sequence, {
        status: 'completed',
      });

      // Find and activate the next milestone
      const nextMilestone = await getNextMilestone(
        goalId,
        currentMilestone.sequence
      );

      if (nextMilestone) {
        // Activate the next milestone
        await updateMilestone(goalId, nextMilestone.sequence, {
          status: 'active',
        });

        // Generate daily quests for the next milestone
        await generateDailyQuestsForMilestone(
          goalId,
          nextMilestone.sequence,
          userId
        );

        Logger.info('Next milestone activated and quests generated', {
          userId,
          goalId,
          nextMilestoneId: nextMilestone.milestoneId,
          nextSequence: nextMilestone.sequence,
          requestId,
        });
      } else {
        // No more milestones - the entire epic quest is complete!
        await updateGoal(userId, goalId, { status: 'completed' });

        Logger.info('Epic quest completed - all milestones finished', {
          userId,
          goalId,
          requestId,
        });
      }
    }
  } catch (error) {
    // Log the error but don't fail the task update
    Logger.error('Error checking milestone completion', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId,
      taskId,
      requestId,
    });
  }
}
