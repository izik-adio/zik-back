/**
 * Database operations for ChatMessages table
 */
import { QueryCommand, PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import { docClient } from './client';
import { config } from '../../config';
import { ChatMessage, UserProfile, ContextData } from '../../types';
import { DatabaseError } from '../../utils/errors';
import { Logger } from '../../utils/logger';
import { fetchActiveGoals } from './goals';
import { fetchTodayTasks } from './tasks';
import { fetchUserProfile } from './users';

/**
 * Fetches recent chat history for a user
 * @param userId - The user's unique identifier
 * @param limit - Maximum number of messages to retrieve (default: 10)
 * @returns Promise<ChatMessage[]> - Array of chat messages in chronological order
 * @throws DatabaseError - If database operation fails
 */
export async function fetchChatHistory(
  userId: string,
  limit: number = config.defaultChatHistoryLimit
): Promise<ChatMessage[]> {
  try {
    Logger.debug('Fetching chat history', { userId, limit });

    const command = new QueryCommand({
      TableName: config.chatMessagesTableName,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId,
      },
      ScanIndexForward: false, // Sort by timestamp descending (newest first)
      Limit: limit,
    });

    const result = await docClient.send(command);
    const messages = (result.Items as ChatMessage[]) || [];

    // Reverse to get chronological order (oldest first)
    const chronologicalMessages = messages.reverse();

    Logger.debug('Chat history fetched successfully', {
      userId,
      messagesRetrieved: chronologicalMessages.length,
    });

    return chronologicalMessages;
  } catch (error) {
    Logger.error('Failed to fetch chat history', error, {
      userId,
      table: config.chatMessagesTableName,
      limit,
    });
    throw new DatabaseError('Failed to fetch chat history', error);
  }
}

/**
 * Cleans up old chat messages to maintain only the last N messages per user
 * @param userId - The user's unique identifier
 * @param maxMessages - Maximum number of messages to keep (default from config)
 * @param throwErrors - Whether to throw errors or just log them (default: false)
 * @throws DatabaseError - If database operation fails and throwErrors is true
 */
async function cleanupOldChatMessages(
  userId: string,
  maxMessages: number = config.maxChatHistoryPerUser,
  throwErrors: boolean = false
): Promise<void> {
  try {
    Logger.debug('Starting chat message cleanup', { userId, maxMessages });

    // Get all messages for the user, sorted by timestamp (newest first)
    const command = new QueryCommand({
      TableName: config.chatMessagesTableName,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId,
      },
      ScanIndexForward: false, // Sort by timestamp descending (newest first)
      ProjectionExpression: 'userId, #timestamp, messageId',
      ExpressionAttributeNames: {
        '#timestamp': 'timestamp', // timestamp is a reserved word
      },
    });

    const result = await docClient.send(command);
    const messages = (result.Items as Pick<ChatMessage, 'userId' | 'timestamp' | 'messageId'>[]) || [];

    // If we have more messages than the limit, delete the oldest ones
    if (messages.length > maxMessages) {
      const messagesToDelete = messages.slice(maxMessages); // Keep first N, delete the rest

      Logger.debug('Deleting old chat messages', {
        userId,
        totalMessages: messages.length,
        messagesToDelete: messagesToDelete.length,
        maxMessages,
        messagesToDeleteSample: messagesToDelete.slice(0, 2).map(m => ({ messageId: m.messageId, timestamp: m.timestamp })),
      });

      // Delete messages in parallel (batch operations would be more efficient for large numbers)
      const deletePromises = messagesToDelete.map(message => {
        const deleteCommand = new DeleteCommand({
          TableName: config.chatMessagesTableName,
          Key: {
            userId: message.userId,
            timestamp: message.timestamp,
          },
        });
        return docClient.send(deleteCommand);
      });

      await Promise.all(deletePromises);

      Logger.info('Chat message cleanup completed', {
        userId,
        deletedMessages: messagesToDelete.length,
        remainingMessages: maxMessages,
      });
    } else {
      Logger.debug('No cleanup needed', {
        userId,
        messageCount: messages.length,
        maxMessages,
      });
    }
  } catch (error) {
    Logger.error('Failed to cleanup old chat messages', error, {
      userId,
      table: config.chatMessagesTableName,
      maxMessages,
    });

    if (throwErrors) {
      throw new DatabaseError('Failed to cleanup chat messages', error);
    }
    // Don't throw error - cleanup failure shouldn't break the main flow (unless explicitly requested)
  }
}

/**
 * Saves a chat message to the conversation history
 * @param userId - The user's unique identifier
 * @param role - The message role ('user' or 'assistant')
 * @param content - The message content
 * @throws DatabaseError - If database operation fails
 */
export async function saveChatMessage(
  userId: string,
  role: 'user' | 'assistant',
  content: string
): Promise<void> {
  try {
    // Calculate TTL (30 days from now as fallback cleanup)
    const ttlSeconds = Math.floor(Date.now() / 1000) + (config.chatHistoryRetentionDays * 24 * 60 * 60);

    const chatMessage: ChatMessage & { ttl: number } = {
      userId,
      timestamp: new Date().toISOString(),
      messageId: randomUUID(),
      role,
      content,
      ttl: ttlSeconds, // TTL for automatic DynamoDB cleanup
    };

    const command = new PutCommand({
      TableName: config.chatMessagesTableName,
      Item: chatMessage,
    });

    await docClient.send(command);

    Logger.debug('Chat message saved', {
      userId,
      role,
      messageLength: content.length,
    });

    // Cleanup old messages to maintain the limit (run asynchronously)
    // We don't await this to avoid slowing down the chat response
    cleanupOldChatMessages(userId).catch(error => {
      Logger.error('Background cleanup failed', error, { userId });
    });

  } catch (error) {
    Logger.error('Failed to save chat message', error, { userId, role });
    throw new DatabaseError('Failed to save chat message', error);
  }
}

/**
 * Fetches all required context data in parallel
 * @param userId - The authenticated user's ID
 * @returns Promise<ContextData> - Aggregated context data
 */
export async function getContextForUser(userId: string): Promise<ContextData> {
  Logger.debug('Starting parallel context fetch', { userId });

  const [userProfile, activeGoals, todayTasks, chatHistory] = await Promise.all(
    [
      fetchUserProfile(userId),
      fetchActiveGoals(userId),
      fetchTodayTasks(userId),
      fetchChatHistory(userId, config.defaultChatHistoryLimit),
    ]
  );

  Logger.debug('Context fetched successfully', {
    userId,
    hasProfile: !!userProfile,
    goalsCount: activeGoals.length,
    tasksCount: todayTasks.length,
    historyCount: chatHistory.length,
  });

  return {
    userProfile,
    activeGoals,
    todayTasks,
    chatHistory,
  };
}

/**
 * Manually cleanup chat history for a user (exposed function)
 * @param userId - The user's unique identifier
 * @param maxMessages - Maximum number of messages to keep (optional)
 * @returns Promise<number> - Number of messages deleted
 * @throws DatabaseError - If database operation fails
 */
export async function cleanupUserChatHistory(
  userId: string,
  maxMessages?: number
): Promise<number> {
  try {
    const limit = maxMessages !== undefined ? maxMessages : config.maxChatHistoryPerUser;

    Logger.debug('Manual chat history cleanup initiated', { userId, limit, originalMaxMessages: maxMessages });

    // Get current message count before cleanup
    const beforeCommand = new QueryCommand({
      TableName: config.chatMessagesTableName,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId,
      },
      Select: 'COUNT',
    });

    const beforeResult = await docClient.send(beforeCommand);
    const messageCountBefore = beforeResult.Count || 0;

    Logger.debug('Message count before cleanup', { userId, messageCountBefore, limit });

    // Perform cleanup (throw errors for manual cleanup)
    await cleanupOldChatMessages(userId, limit, true);

    Logger.debug('Cleanup operation completed', { userId, limit });

    // Get message count after cleanup
    const afterCommand = new QueryCommand({
      TableName: config.chatMessagesTableName,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId,
      },
      Select: 'COUNT',
    });

    const afterResult = await docClient.send(afterCommand);
    const messageCountAfter = afterResult.Count || 0;

    const deletedCount = messageCountBefore - messageCountAfter;

    Logger.info('Manual chat history cleanup completed', {
      userId,
      messagesBefore: messageCountBefore,
      messagesAfter: messageCountAfter,
      deletedMessages: deletedCount,
      limit,
    });

    return deletedCount;
  } catch (error) {
    Logger.error('Failed to manually cleanup chat history', error, { userId, maxMessages });
    throw new DatabaseError('Failed to cleanup chat history', error);
  }
}
