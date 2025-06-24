/**
 * Database operations for Tasks table
 */
import {
  GetCommand,
  QueryCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import { docClient } from './client';
import { config } from '../../config';
import { Task } from '../../types';
import {
  DatabaseError,
  NotFoundError,
  ValidationError,
} from '../../utils/errors';
import { Logger } from '../../utils/logger';

/**
 * Validates input for date format (YYYY-MM-DD)
 * @param dateString - Date string to validate
 * @returns boolean - True if valid format
 */
function isValidDateFormat(dateString: string): boolean {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateString)) return false;

  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date.getTime());
}

/**
 * Fetches today's tasks for a user using GSI
 * @param userId - The user's unique identifier
 * @returns Promise<Task[]> - Array of tasks due today
 * @throws DatabaseError - If database operation fails
 */
export async function fetchTodayTasks(userId: string): Promise<Task[]> {
  try {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    Logger.debug('Fetching today tasks', { userId, date: today });

    const command = new QueryCommand({
      TableName: config.tasksTableName,
      IndexName: config.userIdDueDateIndex,
      KeyConditionExpression: 'userId = :userId AND dueDate = :dueDate',
      ExpressionAttributeValues: {
        ':userId': userId,
        ':dueDate': today,
      },
    });

    const result = await docClient.send(command);
    const tasks = (result.Items as Task[]) || [];

    Logger.debug('Today tasks fetched successfully', {
      userId,
      date: today,
      count: tasks.length,
    });
    return tasks;
  } catch (error) {
    Logger.error('Failed to fetch today tasks', error, {
      userId,
      table: config.tasksTableName,
      index: config.userIdDueDateIndex,
    });
    throw new DatabaseError('Failed to fetch today tasks', error);
  }
}

/**
 * Creates a new task in the database
 * @param userId - The authenticated user's ID
 * @param title - The task title
 * @param dueDate - Optional due date
 * @param epicId - Optional linked goal ID
 * @returns Promise<string> - Success confirmation message
 * @throws ValidationError - If input validation fails
 * @throws DatabaseError - If database operation fails
 */
export async function createTask(
  userId: string,
  title: string,
  dueDate?: string,
  epicId?: string
): Promise<string> {
  // Validate required fields
  if (!title || title.trim().length === 0) {
    throw new ValidationError('Title is required and cannot be empty');
  }

  if (title.length > config.maxTitleLength) {
    throw new ValidationError(
      `Title cannot exceed ${config.maxTitleLength} characters`
    );
  }

  // Validate date format if provided
  if (dueDate && !isValidDateFormat(dueDate)) {
    throw new ValidationError('Due date must be in YYYY-MM-DD format');
  }

  const now = new Date().toISOString();
  const taskId = randomUUID();
  const taskDueDate = dueDate || new Date().toISOString().split('T')[0];

  try {
    const task: Task = {
      userId,
      taskId,
      taskName: title.trim(),
      dueDate: taskDueDate,
      priority: 'medium',
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };

    // Validate and link to epic if provided
    if (epicId) {
      if (typeof epicId !== 'string' || epicId.trim().length === 0) {
        throw new ValidationError('Epic ID must be a valid string');
      }
      task.goalId = epicId.trim();
    }

    const command = new PutCommand({
      TableName: config.tasksTableName,
      Item: task,
    });

    await docClient.send(command);

    Logger.info('DynamoDB operation successful', {
      operation: 'create',
      table: 'Tasks',
      taskId,
      userId,
      linkedToGoal: !!epicId,
    });

    return `✅ Daily Quest created: '${title}'! 📅`;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    Logger.error('Failed to create task', error, { title, userId });
    throw new DatabaseError('Failed to create task', error);
  }
}

/**
 * Updates an existing task in the database
 * @param userId - The authenticated user's ID
 * @param taskId - The task ID to update
 * @param updateFields - Fields to update
 * @returns Promise<string> - Success confirmation message
 * @throws ValidationError - If input validation fails
 * @throws NotFoundError - If task doesn't exist
 * @throws DatabaseError - If database operation fails
 */
export async function updateTask(
  userId: string,
  taskId: string,
  updateFields: { [key: string]: any }
): Promise<string> {
  // Validate required fields
  if (!taskId || taskId.trim().length === 0) {
    throw new ValidationError('Task ID is required for update operation');
  }

  if (!updateFields || Object.keys(updateFields).length === 0) {
    throw new ValidationError(
      'Update fields are required for update operation'
    );
  }

  // Validate updateFields
  const allowedFields = [
    'taskName',
    'description',
    'dueDate',
    'priority',
    'status',
    'goalId',
  ];
  const invalidFields = Object.keys(updateFields).filter(
    (field) => !allowedFields.includes(field) && field !== 'updatedAt'
  );

  if (invalidFields.length > 0) {
    throw new ValidationError(
      `Invalid fields for daily: ${invalidFields.join(', ')}`
    );
  }

  // Validate status values
  if (updateFields.status) {
    const validStatuses = ['pending', 'in-progress', 'completed'];
    if (!validStatuses.includes(updateFields.status)) {
      throw new ValidationError(
        `Invalid status for daily: ${updateFields.status}`
      );
    }
  }

  // Validate date format if provided
  if (updateFields.dueDate && !isValidDateFormat(updateFields.dueDate)) {
    throw new ValidationError('Due date must be in YYYY-MM-DD format');
  }

  try {
    // Build update expression
    const updateExpressions: string[] = [];
    const expressionAttributeNames: { [key: string]: string } = {};
    const expressionAttributeValues: { [key: string]: any } = {};

    // Always update the updatedAt timestamp
    updateFields.updatedAt = new Date().toISOString();

    Object.entries(updateFields).forEach(([key, value], index) => {
      const nameKey = `#${key}`;
      const valueKey = `:val${index}`;

      updateExpressions.push(`${nameKey} = ${valueKey}`);
      expressionAttributeNames[nameKey] = key;
      expressionAttributeValues[valueKey] = value;
    });

    // Add userId to condition check
    expressionAttributeValues[':userId'] = userId;

    const command = new UpdateCommand({
      TableName: config.tasksTableName,
      Key: {
        userId,
        taskId: taskId.trim(),
      },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ConditionExpression: 'userId = :userId', // Ensure ownership
      ReturnValues: 'ALL_NEW',
    });

    const result = await docClient.send(command);
    const taskName = (result.Attributes as Task)?.taskName;

    Logger.info('DynamoDB operation successful', {
      operation: 'update',
      table: config.tasksTableName,
      taskId,
      userId,
      fieldsUpdated: Object.keys(updateFields),
    });

    return `✅ Quest updated: '${taskName}'! 🔄`;
  } catch (error: any) {
    if (error.name === 'ConditionalCheckFailedException') {
      Logger.warn('Task not found for update', { taskId, userId });
      throw new NotFoundError('Task not found or access denied');
    }
    Logger.error('Failed to update task', error, { taskId, userId });
    throw new DatabaseError('Failed to update task', error);
  }
}

/**
 * Deletes an existing task from the database
 * @param userId - The authenticated user's ID
 * @param taskId - The task ID to delete
 * @returns Promise<string> - Success confirmation message
 * @throws ValidationError - If input validation fails
 * @throws NotFoundError - If task doesn't exist
 * @throws DatabaseError - If database operation fails
 */
export async function deleteTask(
  userId: string,
  taskId: string
): Promise<string> {
  // Validate required fields
  if (!taskId || taskId.trim().length === 0) {
    throw new ValidationError('Task ID is required for delete operation');
  }

  try {
    // First, get the item to return its name in the confirmation
    const getCommand = new GetCommand({
      TableName: config.tasksTableName,
      Key: {
        userId,
        taskId: taskId.trim(),
      },
    });

    const getResult = await docClient.send(getCommand);

    if (!getResult.Item) {
      Logger.warn('Task not found for deletion', { taskId, userId });
      throw new NotFoundError('Task not found');
    }

    const taskName = (getResult.Item as Task).taskName;

    // Now delete the item
    const deleteCommand = new DeleteCommand({
      TableName: config.tasksTableName,
      Key: {
        userId,
        taskId: taskId.trim(),
      },
      ConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId,
      },
    });

    await docClient.send(deleteCommand);

    Logger.info('DynamoDB operation successful', {
      operation: 'delete',
      table: config.tasksTableName,
      taskId,
      userId,
    });

    return `✅ Quest deleted: '${taskName}'! 🗑️`;
  } catch (error: any) {
    if (error instanceof NotFoundError) {
      throw error;
    }
    if (error.name === 'ConditionalCheckFailedException') {
      Logger.warn('Task not found for deletion (conditional check failed)', {
        taskId,
        userId,
      });
      throw new NotFoundError('Task not found or access denied');
    }
    Logger.error('Failed to delete task', error, { taskId, userId });
    throw new DatabaseError('Failed to delete task', error);
  }
}
