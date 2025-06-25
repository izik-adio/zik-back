/**
 * Database operations for Goals table
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
import { Goal } from '../../types/index';
import {
  DatabaseError,
  NotFoundError,
  ValidationError,
} from '../../utils/errors';
import { Logger } from '../../utils/logger';

/**
 * Fetches active goals for a user from Goals table
 * @param userId - The user's unique identifier
 * @returns Promise<Goal[]> - Array of active goals
 * @throws DatabaseError - If database operation fails
 */
export async function fetchActiveGoals(userId: string): Promise<Goal[]> {
  try {
    Logger.debug('Fetching active goals', { userId });

    const command = new QueryCommand({
      TableName: config.goalsTableName,
      KeyConditionExpression: 'userId = :userId',
      FilterExpression: '#status = :status',
      ExpressionAttributeNames: {
        '#status': 'status',
      },
      ExpressionAttributeValues: {
        ':userId': userId,
        ':status': 'active',
      },
    });

    const result = await docClient.send(command);
    const goals = (result.Items as Goal[]) || [];

    Logger.debug('Active goals fetched successfully', {
      userId,
      count: goals.length,
    });
    return goals;
  } catch (error) {
    Logger.error('Failed to fetch active goals', error, {
      userId,
      table: config.goalsTableName,
    });
    throw new DatabaseError('Failed to fetch active goals', error);
  }
}

/**
 * Creates a new goal in the database
 * @param userId - The authenticated user's ID
 * @param title - The goal title
 * @returns Promise<string> - Success confirmation message
 * @throws ValidationError - If input validation fails
 * @throws DatabaseError - If database operation fails
 */
export async function createGoal(
  userId: string,
  title: string
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

  const now = new Date().toISOString();
  const goalId = randomUUID();

  try {
    const goal: Goal = {
      userId,
      goalId,
      goalName: title.trim(),
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    const command = new PutCommand({
      TableName: config.goalsTableName,
      Item: goal,
    });

    await docClient.send(command);

    Logger.info('DynamoDB operation successful', {
      operation: 'create',
      table: 'Goals',
      goalId,
      userId,
    });

    return `✅ Epic Quest created: '${title}'! 🎯`;
  } catch (error) {
    Logger.error('Failed to create goal', error, { title, userId });
    throw new DatabaseError('Failed to create goal', error);
  }
}

/**
 * Updates an existing goal in the database
 * @param userId - The authenticated user's ID
 * @param goalId - The goal ID to update
 * @param updateFields - Fields to update
 * @returns Promise<string> - Success confirmation message
 * @throws ValidationError - If input validation fails
 * @throws NotFoundError - If goal doesn't exist
 * @throws DatabaseError - If database operation fails
 */
export async function updateGoal(
  userId: string,
  goalId: string,
  updateFields: { [key: string]: any }
): Promise<string> {
  // Validate required fields
  if (!goalId || goalId.trim().length === 0) {
    throw new ValidationError('Goal ID is required for update operation');
  }

  if (!updateFields || Object.keys(updateFields).length === 0) {
    throw new ValidationError(
      'Update fields are required for update operation'
    );
  }

  // Validate updateFields
  const allowedFields = [
    'goalName',
    'description',
    'targetDate',
    'category',
    'status',
  ];
  const invalidFields = Object.keys(updateFields).filter(
    (field) => !allowedFields.includes(field) && field !== 'updatedAt'
  );

  if (invalidFields.length > 0) {
    throw new ValidationError(
      `Invalid fields for epic: ${invalidFields.join(', ')}`
    );
  }

  // Validate status values
  if (updateFields.status) {
    const validStatuses = ['active', 'completed', 'paused'];
    if (!validStatuses.includes(updateFields.status)) {
      throw new ValidationError(
        `Invalid status for epic: ${updateFields.status}`
      );
    }
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
      TableName: config.goalsTableName,
      Key: {
        userId,
        goalId: goalId.trim(),
      },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ConditionExpression: 'userId = :userId', // Ensure ownership
      ReturnValues: 'ALL_NEW',
    });

    const result = await docClient.send(command);
    const goalName = (result.Attributes as Goal)?.goalName;

    Logger.info('DynamoDB operation successful', {
      operation: 'update',
      table: config.goalsTableName,
      goalId,
      userId,
      fieldsUpdated: Object.keys(updateFields),
    });

    return `✅ Quest updated: '${goalName}'! 🔄`;
  } catch (error: any) {
    if (error.name === 'ConditionalCheckFailedException') {
      Logger.warn('Goal not found for update', { goalId, userId });
      throw new NotFoundError('Goal not found or access denied');
    }
    Logger.error('Failed to update goal', error, { goalId, userId });
    throw new DatabaseError('Failed to update goal', error);
  }
}

/**
 * Deletes an existing goal from the database
 * @param userId - The authenticated user's ID
 * @param goalId - The goal ID to delete
 * @returns Promise<string> - Success confirmation message
 * @throws ValidationError - If input validation fails
 * @throws NotFoundError - If goal doesn't exist
 * @throws DatabaseError - If database operation fails
 */
export async function deleteGoal(
  userId: string,
  goalId: string
): Promise<string> {
  // Validate required fields
  if (!goalId || goalId.trim().length === 0) {
    throw new ValidationError('Goal ID is required for delete operation');
  }

  try {
    // First, get the item to return its name in the confirmation
    const getCommand = new GetCommand({
      TableName: config.goalsTableName,
      Key: {
        userId,
        goalId: goalId.trim(),
      },
    });

    const getResult = await docClient.send(getCommand);

    if (!getResult.Item) {
      Logger.warn('Goal not found for deletion', { goalId, userId });
      throw new NotFoundError('Goal not found');
    }

    const goalName = (getResult.Item as Goal).goalName;

    // Now delete the item
    const deleteCommand = new DeleteCommand({
      TableName: config.goalsTableName,
      Key: {
        userId,
        goalId: goalId.trim(),
      },
      ConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId,
      },
    });

    await docClient.send(deleteCommand);

    Logger.info('DynamoDB operation successful', {
      operation: 'delete',
      table: config.goalsTableName,
      goalId,
      userId,
    });

    return `✅ Quest deleted: '${goalName}'! 🗑️`;
  } catch (error: any) {
    if (error instanceof NotFoundError) {
      throw error;
    }
    if (error.name === 'ConditionalCheckFailedException') {
      Logger.warn('Goal not found for deletion (conditional check failed)', {
        goalId,
        userId,
      });
      throw new NotFoundError('Goal not found or access denied');
    }
    Logger.error('Failed to delete goal', error, { goalId, userId });
    throw new DatabaseError('Failed to delete goal', error);
  }
}
