/**
 * Database operations for ChatMessages table and user profiles
 */
import { GetCommand, QueryCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import { docClient } from './client';
import { config } from '../../config';
import { ChatMessage, UserProfile, ContextData } from '../../types';
import { DatabaseError } from '../../utils/errors';
import { Logger } from '../../utils/logger';
import { fetchActiveGoals } from './goals';
import { fetchTodayTasks } from './tasks';

/**
 * Fetches user profile from Users table
 * @param userId - The user's unique identifier
 * @returns Promise<UserProfile | null> - User profile or null if not found
 * @throws DatabaseError - If database operation fails
 */
export async function fetchUserProfile(
  userId: string
): Promise<UserProfile | null> {
  try {
    Logger.debug('Fetching user profile', { userId });

    const command = new GetCommand({
      TableName: config.usersTableName,
      Key: { userId },
    });

    const result = await docClient.send(command);

    if (result.Item) {
      Logger.debug('User profile fetched successfully', { userId });
      return result.Item as UserProfile;
    } else {
      Logger.warn('User profile not found', { userId });
      return null;
    }
  } catch (error) {
    Logger.error('Failed to fetch user profile', error, {
      userId,
      table: config.usersTableName,
    });
    throw new DatabaseError('Failed to fetch user profile', error);
  }
}

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
    const chatMessage: ChatMessage = {
      userId,
      timestamp: new Date().toISOString(),
      messageId: randomUUID(),
      role,
      content,
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
