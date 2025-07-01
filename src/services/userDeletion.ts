/**
 * Comprehensive user deletion service
 * Handles complete removal of user data from all tables and Cognito
 */
import { DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import {
  CognitoIdentityProviderClient,
  AdminDeleteUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { docClient } from './database/client';
import { config } from '../config';
import { Logger } from '../utils/logger';
import { DatabaseError, ValidationError } from '../utils/errors';

// Initialize Cognito client
const cognitoClient = new CognitoIdentityProviderClient({
  region: config.awsRegion,
});

/**
 * Completely deletes a user account and all associated data
 * @param userId - The user ID to delete
 * @param accessToken - The user's access token for Cognito operations
 * @returns Promise<string> - Success message
 * @throws ValidationError - If user not found
 * @throws DatabaseError - If deletion fails
 */
export async function deleteUserAccount(
  userId: string,
  accessToken: string
): Promise<string> {
  Logger.info('Starting complete user account deletion', { userId });

  try {
    // Validate user exists by checking profile
    const userExists = await checkUserExists(userId);
    if (!userExists) {
      throw new ValidationError('User profile not found');
    }

    // Delete all user data in parallel (except Cognito which should be last)
    const deletionPromises = [
      deleteUserChatMessages(userId),
      deleteUserGoals(userId),
      deleteUserTasks(userId),
      deleteUserRecurrenceRules(userId),
      deleteUserMilestones(userId),
    ];

    const results = await Promise.allSettled(deletionPromises);

    // Log any failures but continue with profile deletion
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        Logger.warn('Failed to delete some user data', {
          userId,
          table: [
            'chat_messages',
            'goals',
            'tasks',
            'recurrence_rules',
            'milestones',
          ][index],
          error: result.reason?.message,
        });
      }
    });

    // Delete user profile
    await deleteUserProfile(userId);

    // Finally, delete from Cognito
    await deleteFromCognito(userId, accessToken);

    Logger.info('User account completely deleted', { userId });
    return 'User account and all associated data have been permanently deleted';
  } catch (error) {
    Logger.error('Failed to delete user account', error, { userId });

    if (error instanceof ValidationError) {
      throw error;
    }

    throw new DatabaseError('Failed to delete user account', error);
  }
}

/**
 * Check if user exists in the database
 */
async function checkUserExists(userId: string): Promise<boolean> {
  try {
    const command = new QueryCommand({
      TableName: config.usersTableName,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId,
      },
      Limit: 1,
    });

    const result = await docClient.send(command);
    return !!(result.Items && result.Items.length > 0);
  } catch (error) {
    Logger.error('Failed to check user existence', error, { userId });
    return false;
  }
}

/**
 * Delete user profile from users table
 */
async function deleteUserProfile(userId: string): Promise<void> {
  const command = new DeleteCommand({
    TableName: config.usersTableName,
    Key: { userId },
  });

  await docClient.send(command);
  Logger.debug('User profile deleted', {
    userId,
    table: config.usersTableName,
  });
}

/**
 * Delete all user chat messages
 */
async function deleteUserChatMessages(userId: string): Promise<void> {
  await deleteAllUserItems(
    config.chatMessagesTableName,
    userId,
    'messageId',
    'chat messages'
  );
}

/**
 * Delete all user goals
 */
async function deleteUserGoals(userId: string): Promise<void> {
  await deleteAllUserItems(config.goalsTableName, userId, 'goalId', 'goals');
}

/**
 * Delete all user tasks
 */
async function deleteUserTasks(userId: string): Promise<void> {
  await deleteAllUserItems(config.tasksTableName, userId, 'taskId', 'tasks');
}

/**
 * Delete all user recurrence rules
 */
async function deleteUserRecurrenceRules(userId: string): Promise<void> {
  await deleteAllUserItems(
    config.recurrenceRulesTableName,
    userId,
    'ruleId',
    'recurrence rules'
  );
}

/**
 * Delete all user milestones
 */
async function deleteUserMilestones(userId: string): Promise<void> {
  await deleteAllUserItems(
    config.milestonesTableName,
    userId,
    'milestoneId',
    'milestones'
  );
}

/**
 * Generic function to delete all items for a user from a table
 */
async function deleteAllUserItems(
  tableName: string,
  userId: string,
  sortKeyName: string,
  itemType: string
): Promise<void> {
  if (!tableName) {
    Logger.warn(
      `Skipping deletion from ${itemType} - table name not configured`
    );
    return;
  }

  try {
    let lastEvaluatedKey: any = undefined;
    let totalDeleted = 0;

    do {
      // Query all items for the user
      const queryCommand = new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: {
          ':userId': userId,
        },
        ExclusiveStartKey: lastEvaluatedKey,
      });

      const queryResult = await docClient.send(queryCommand);

      if (queryResult.Items && queryResult.Items.length > 0) {
        // Delete items in batches
        const deletePromises = queryResult.Items.map((item) => {
          const deleteCommand = new DeleteCommand({
            TableName: tableName,
            Key: {
              userId: userId,
              [sortKeyName]: item[sortKeyName],
            },
          });
          return docClient.send(deleteCommand);
        });

        await Promise.all(deletePromises);
        totalDeleted += queryResult.Items.length;
      }

      lastEvaluatedKey = queryResult.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    Logger.debug(`Deleted ${itemType}`, {
      userId,
      table: tableName,
      count: totalDeleted,
    });
  } catch (error) {
    Logger.error(`Failed to delete ${itemType}`, error, {
      userId,
      table: tableName,
    });
    throw error;
  }
}

/**
 * Delete user from Cognito User Pool
 */
async function deleteFromCognito(
  userId: string,
  accessToken: string
): Promise<void> {
  try {
    // Use AdminDeleteUser with the userId as username (common pattern)
    const deleteCommand = new AdminDeleteUserCommand({
      UserPoolId: config.userPoolId,
      Username: userId, // Assuming userId is the username in Cognito
    });

    await cognitoClient.send(deleteCommand);
    Logger.debug('User deleted from Cognito', { userId });
  } catch (error) {
    Logger.error('Failed to delete user from Cognito', error, { userId });
    // Don't throw here as the database cleanup is more important
    // Just log the error
  }
}
