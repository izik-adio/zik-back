/**
 * Database operations for RecurrenceRules table
 */
import {
  QueryCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import { docClient } from './client';
import { config } from '../../config';
import { RecurrenceRule } from '../../types';
import {
  DatabaseError,
  NotFoundError,
  ValidationError,
} from '../../utils/errors';
import { Logger } from '../../utils/logger';

/**
 * Fetches all active recurrence rules from the database
 * @returns Promise<RecurrenceRule[]> - Array of active recurrence rules
 * @throws DatabaseError - If database operation fails
 */
export async function fetchActiveRecurrenceRules(): Promise<RecurrenceRule[]> {
  try {
    Logger.debug('Fetching all active recurrence rules');

    const command = new ScanCommand({
      TableName: config.recurrenceRulesTableName,
      FilterExpression: '#status = :status',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':status': 'active' },
    });

    const result = await docClient.send(command);
    const rules = (result.Items as RecurrenceRule[]) || [];

    Logger.debug('Active recurrence rules fetched successfully', {
      count: rules.length,
    });
    return rules;
  } catch (error) {
    Logger.error('Failed to fetch active recurrence rules', error, {
      table: config.recurrenceRulesTableName,
    });
    throw new DatabaseError('Failed to fetch active recurrence rules', error);
  }
}

/**
 * Fetches all recurrence rules for a specific user
 * @param userId - The user's unique identifier
 * @returns Promise<RecurrenceRule[]> - Array of user's recurrence rules
 * @throws DatabaseError - If database operation fails
 */
export async function fetchUserRecurrenceRules(
  userId: string
): Promise<RecurrenceRule[]> {
  try {
    Logger.debug('Fetching user recurrence rules', { userId });

    const command = new QueryCommand({
      TableName: config.recurrenceRulesTableName,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId,
      },
    });

    const result = await docClient.send(command);
    const rules = (result.Items as RecurrenceRule[]) || [];

    Logger.debug('User recurrence rules fetched successfully', {
      userId,
      count: rules.length,
    });
    return rules;
  } catch (error) {
    Logger.error('Failed to fetch user recurrence rules', error, {
      userId,
      table: config.recurrenceRulesTableName,
    });
    throw new DatabaseError('Failed to fetch user recurrence rules', error);
  }
}

/**
 * Creates a new recurrence rule in the database
 * @param userId - The authenticated user's ID
 * @param title - The task title for recurring tasks
 * @param frequency - How often the task should recur
 * @param options - Additional options for the recurrence rule
 * @returns Promise<string> - Success confirmation message
 * @throws ValidationError - If input validation fails
 * @throws DatabaseError - If database operation fails
 */
export async function createRecurrenceRule(
  userId: string,
  title: string,
  frequency: 'daily' | 'weekdays' | 'weekends' | 'weekly',
  options: {
    goalId?: string;
    description?: string;
    priority?: 'low' | 'medium' | 'high';
    daysOfWeek?: number[];
  } = {}
): Promise<string> {
  // Validate required fields
  if (!title || title.trim().length === 0) {
    throw new ValidationError('Title is required and cannot be empty');
  }

  if (title.length > 200) {
    throw new ValidationError('Title cannot exceed 200 characters');
  }

  // Validate frequency-specific options
  if (
    frequency === 'weekly' &&
    (!options.daysOfWeek || options.daysOfWeek.length === 0)
  ) {
    throw new ValidationError(
      'Days of week must be specified for weekly frequency'
    );
  }

  try {
    const now = new Date().toISOString();
    const recurrenceRuleId = `rule_${randomUUID()}`;

    const recurrenceRule: RecurrenceRule = {
      userId,
      recurrenceRuleId,
      title: title.trim(),
      frequency,
      status: 'active',
      createdAt: now,
      updatedAt: now,
      ...options,
    };

    Logger.debug('Creating recurrence rule', {
      userId,
      recurrenceRuleId,
      title,
      frequency,
    });

    const command = new PutCommand({
      TableName: config.recurrenceRulesTableName,
      Item: recurrenceRule,
    });

    await docClient.send(command);

    Logger.info('Recurrence rule created successfully', {
      userId,
      recurrenceRuleId,
      title,
      frequency,
    });

    return `✅ Recurrence rule created! "${title}" will now be generated ${frequency}.`;
  } catch (error) {
    Logger.error('Failed to create recurrence rule', error, {
      userId,
      title,
      frequency,
      table: config.recurrenceRulesTableName,
    });
    throw new DatabaseError('Failed to create recurrence rule', error);
  }
}

/**
 * Updates an existing recurrence rule
 * @param userId - The authenticated user's ID
 * @param recurrenceRuleId - The rule ID to update
 * @param updateFields - Fields to update
 * @returns Promise<string> - Success confirmation message
 * @throws ValidationError - If input validation fails
 * @throws NotFoundError - If rule doesn't exist
 * @throws DatabaseError - If database operation fails
 */
export async function updateRecurrenceRule(
  userId: string,
  recurrenceRuleId: string,
  updateFields: Partial<
    Pick<
      RecurrenceRule,
      | 'title'
      | 'description'
      | 'priority'
      | 'status'
      | 'frequency'
      | 'daysOfWeek'
    >
  >
): Promise<string> {
  if (!recurrenceRuleId) {
    throw new ValidationError('Recurrence rule ID is required');
  }

  if (!updateFields || Object.keys(updateFields).length === 0) {
    throw new ValidationError('At least one field must be provided for update');
  }

  try {
    Logger.debug('Updating recurrence rule', {
      userId,
      recurrenceRuleId,
      updateFields,
    });

    // Build update expression dynamically
    const updateExpressions: string[] = [];
    const expressionAttributeNames: { [key: string]: string } = {};
    const expressionAttributeValues: { [key: string]: any } = {};

    Object.entries(updateFields).forEach(([key, value], index) => {
      const attrName = `#attr${index}`;
      const attrValue = `:val${index}`;

      updateExpressions.push(`${attrName} = ${attrValue}`);
      expressionAttributeNames[attrName] = key;
      expressionAttributeValues[attrValue] = value;
    });

    // Always update the updatedAt timestamp
    updateExpressions.push('#updatedAt = :updatedAt');
    expressionAttributeNames['#updatedAt'] = 'updatedAt';
    expressionAttributeValues[':updatedAt'] = new Date().toISOString();

    const command = new UpdateCommand({
      TableName: config.recurrenceRulesTableName,
      Key: { userId, recurrenceRuleId },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ConditionExpression:
        'attribute_exists(userId) AND attribute_exists(recurrenceRuleId)',
    });

    await docClient.send(command);

    Logger.info('Recurrence rule updated successfully', {
      userId,
      recurrenceRuleId,
      updateFields,
    });

    return `✅ Recurrence rule updated successfully!`;
  } catch (error: any) {
    if (error.name === 'ConditionalCheckFailedException') {
      Logger.warn('Recurrence rule not found for update', {
        userId,
        recurrenceRuleId,
      });
      throw new NotFoundError('Recurrence rule not found');
    }

    Logger.error('Failed to update recurrence rule', error, {
      userId,
      recurrenceRuleId,
      updateFields,
      table: config.recurrenceRulesTableName,
    });
    throw new DatabaseError('Failed to update recurrence rule', error);
  }
}

/**
 * Deletes a recurrence rule from the database
 * @param userId - The authenticated user's ID
 * @param recurrenceRuleId - The rule ID to delete
 * @returns Promise<string> - Success confirmation message
 * @throws ValidationError - If input validation fails
 * @throws NotFoundError - If rule doesn't exist
 * @throws DatabaseError - If database operation fails
 */
export async function deleteRecurrenceRule(
  userId: string,
  recurrenceRuleId: string
): Promise<string> {
  if (!recurrenceRuleId) {
    throw new ValidationError('Recurrence rule ID is required');
  }

  try {
    Logger.debug('Deleting recurrence rule', { userId, recurrenceRuleId });

    const command = new DeleteCommand({
      TableName: config.recurrenceRulesTableName,
      Key: { userId, recurrenceRuleId },
      ConditionExpression:
        'attribute_exists(userId) AND attribute_exists(recurrenceRuleId)',
    });

    await docClient.send(command);

    Logger.info('Recurrence rule deleted successfully', {
      userId,
      recurrenceRuleId,
    });

    return `✅ Recurrence rule deleted successfully!`;
  } catch (error: any) {
    if (error.name === 'ConditionalCheckFailedException') {
      Logger.warn('Recurrence rule not found for deletion', {
        userId,
        recurrenceRuleId,
      });
      throw new NotFoundError('Recurrence rule not found');
    }

    Logger.error('Failed to delete recurrence rule', error, {
      userId,
      recurrenceRuleId,
      table: config.recurrenceRulesTableName,
    });
    throw new DatabaseError('Failed to delete recurrence rule', error);
  }
}
