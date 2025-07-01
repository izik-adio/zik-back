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
 * @param description - Optional task description
 * @returns Promise<string> - Success confirmation message
 * @throws ValidationError - If input validation fails
 * @throws DatabaseError - If database operation fails
 */
export async function createTask(
  userId: string,
  title: string,
  dueDate?: string,
  epicId?: string,
  description?: string
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

    // Add description if provided
    if (description && description.trim().length > 0) {
      task.description = description.trim();
    }

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

/**
 * Creates multiple tasks in batch (for roadmap/milestone quest generation)
 * @param tasks - Array of task data to create
 * @returns Promise<Task[]> - Array of created tasks
 * @throws ValidationError - If input validation fails
 * @throws DatabaseError - If database operation fails
 */
export async function createTasksBatch(
  tasks: Omit<Task, 'taskId' | 'createdAt' | 'updatedAt'>[]
): Promise<Task[]> {
  if (!tasks || tasks.length === 0) {
    throw new ValidationError('Tasks array cannot be empty');
  }

  const now = new Date().toISOString();
  const tasksToCreate: Task[] = tasks.map((task) => {
    // Validate required fields
    if (!task.taskName || task.taskName.trim().length === 0) {
      throw new ValidationError('Task name is required and cannot be empty');
    }

    if (!task.dueDate || !isValidDateFormat(task.dueDate)) {
      throw new ValidationError(
        'Valid due date in YYYY-MM-DD format is required'
      );
    }

    return {
      ...task,
      taskId: randomUUID(),
      taskName: task.taskName.trim(),
      createdAt: now,
      updatedAt: now,
    };
  });

  try {
    // For batch operations, we'll create them one by one to ensure proper error handling
    // In a production system, you might want to use DynamoDB batch operations
    const createdTasks: Task[] = [];

    for (const task of tasksToCreate) {
      const command = new PutCommand({
        TableName: config.tasksTableName,
        Item: task,
      });

      await docClient.send(command);
      createdTasks.push(task);
    }

    Logger.info('Tasks batch created successfully', {
      userId: tasks[0]?.userId,
      count: createdTasks.length,
    });

    return createdTasks;
  } catch (error: any) {
    Logger.error('Failed to create tasks batch', error);
    throw new DatabaseError('Failed to create tasks batch', error);
  }
}

/**
 * Fetches tasks for a specific milestone
 * @param userId - The user's unique identifier
 * @param milestoneId - The milestone ID to filter by
 * @returns Promise<Task[]> - Array of tasks for the milestone
 * @throws DatabaseError - If database operation fails
 */
export async function fetchTasksByMilestone(
  userId: string,
  milestoneId: string
): Promise<Task[]> {
  try {
    Logger.debug('Fetching tasks by milestone', { userId, milestoneId });

    const command = new QueryCommand({
      TableName: config.tasksTableName,
      KeyConditionExpression: 'userId = :userId',
      FilterExpression: '#milestoneId = :milestoneId',
      ExpressionAttributeNames: {
        '#milestoneId': 'milestoneId',
      },
      ExpressionAttributeValues: {
        ':userId': userId,
        ':milestoneId': milestoneId,
      },
    });

    const result = await docClient.send(command);
    const tasks = (result.Items as Task[]) || [];

    Logger.debug('Tasks by milestone fetched successfully', {
      userId,
      milestoneId,
      count: tasks.length,
    });

    return tasks;
  } catch (error: any) {
    Logger.error('Error fetching tasks by milestone', {
      userId,
      milestoneId,
      error: error.message,
    });
    throw new DatabaseError('Failed to fetch tasks by milestone');
  }
}

/**
 * Fetches a specific task by ID
 * @param userId - The user's unique identifier
 * @param taskId - The task ID to fetch
 * @returns Promise<Task | null> - The task or null if not found
 * @throws DatabaseError - If database operation fails
 */
export async function getTaskById(
  userId: string,
  taskId: string
): Promise<Task | null> {
  try {
    Logger.debug('Fetching task by ID', { userId, taskId });

    const command = new GetCommand({
      TableName: config.tasksTableName,
      Key: {
        userId,
        taskId,
      },
    });

    const result = await docClient.send(command);

    if (!result.Item) {
      Logger.debug('Task not found', { userId, taskId });
      return null;
    }

    const task = result.Item as Task;
    Logger.debug('Task fetched successfully', { userId, taskId });

    return task;
  } catch (error: any) {
    Logger.error('Error fetching task by ID', {
      userId,
      taskId,
      error: error.message,
    });
    throw new DatabaseError('Failed to fetch task');
  }
}
