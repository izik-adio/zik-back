/**
 * Unit tests for Goals database service
 */
import { jest } from '@jest/globals';
import { createGoal, fetchActiveGoals, deleteGoal } from '../goals';
import {
  DatabaseError,
  NotFoundError,
  ValidationError,
} from '../../../utils/errors';

// Mock the DynamoDB Document Client
jest.mock('../client', () => ({
  docClient: {
    send: jest.fn(),
  },
}));

// Mock config
jest.mock('../../../config', () => ({
  config: {
    goalsTableName: 'test-goals-table',
    maxTitleLength: 255,
  },
}));

// Mock logger
jest.mock('../../../utils/logger', () => ({
  Logger: {
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

// Mock UUID generation
jest.mock('crypto', () => ({
  randomUUID: jest.fn().mockReturnValue('test-goal-id-123'),
}));

// Get the mocked docClient
const { docClient } = require('../client');
const mockSend = docClient.send as jest.MockedFunction<typeof docClient.send>;

describe('Goals Database Service', () => {
  const mockUserId = 'test-user-123';
  const mockGoalId = 'goal-456';
  const mockTimestamp = '2025-06-23T10:00:00.000Z';

  beforeEach(() => {
    jest.clearAllMocks();
    // Mock current date to be consistent
    jest.spyOn(Date.prototype, 'toISOString').mockReturnValue(mockTimestamp);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('createGoal', () => {
    it('should successfully create a new goal', async () => {
      const goalTitle = 'Learn Piano';

      mockSend.mockResolvedValueOnce({});

      const result = await createGoal(mockUserId, goalTitle);

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: {
            TableName: 'test-goals-table',
            Item: expect.objectContaining({
              userId: mockUserId,
              goalId: 'test-goal-id-123',
              goalName: goalTitle,
              status: 'active',
              createdAt: mockTimestamp,
              updatedAt: mockTimestamp,
            }),
          },
        })
      );

      // The function returns a string success message
      expect(typeof result).toBe('string');
      expect(result).toContain('Epic Quest created');
    });

    it('should throw ValidationError for empty title', async () => {
      await expect(createGoal(mockUserId, '')).rejects.toThrow(ValidationError);
      await expect(createGoal(mockUserId, '')).rejects.toThrow(
        'Title is required'
      );
    });

    it('should throw DatabaseError when DynamoDB operation fails', async () => {
      const dynamoError = new Error('Write operation failed');
      mockSend.mockRejectedValueOnce(dynamoError);

      await expect(createGoal(mockUserId, 'Test Goal')).rejects.toThrow(
        DatabaseError
      );
    });
  });

  describe('fetchActiveGoals', () => {
    it('should successfully fetch active goals for user', async () => {
      const mockGoals = [
        {
          userId: mockUserId,
          goalId: 'goal-1',
          goalName: 'Learn German',
          status: 'active',
        },
        {
          userId: mockUserId,
          goalId: 'goal-2',
          goalName: 'Fitness Journey',
          status: 'active',
        },
      ];

      mockSend.mockResolvedValueOnce({
        Items: mockGoals,
      });

      const result = await fetchActiveGoals(mockUserId);

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: {
            TableName: 'test-goals-table',
            KeyConditionExpression: 'userId = :userId',
            FilterExpression: '#status = :status',
            ExpressionAttributeNames: {
              '#status': 'status',
            },
            ExpressionAttributeValues: {
              ':userId': mockUserId,
              ':status': 'active',
            },
          },
        })
      );
      expect(result).toEqual(mockGoals);
    });

    it('should return empty array when no active goals found', async () => {
      mockSend.mockResolvedValueOnce({
        Items: [],
      });

      const result = await fetchActiveGoals(mockUserId);

      expect(result).toEqual([]);
    });

    it('should throw DatabaseError when DynamoDB operation fails', async () => {
      const dynamoError = new Error('Query operation failed');
      mockSend.mockRejectedValueOnce(dynamoError);

      await expect(fetchActiveGoals(mockUserId)).rejects.toThrow(DatabaseError);
      await expect(fetchActiveGoals(mockUserId)).rejects.toThrow(
        'Failed to fetch active goals'
      );
    });
  });

  describe('deleteGoal', () => {
    it('should successfully delete a goal', async () => {
      // Mock successful get operation first
      mockSend.mockResolvedValueOnce({
        Item: {
          userId: mockUserId,
          goalId: mockGoalId,
          goalName: 'Goal to Delete',
        },
      });

      // Then mock successful delete operation
      mockSend.mockResolvedValueOnce({});

      await deleteGoal(mockUserId, mockGoalId);

      expect(mockSend).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          input: {
            TableName: 'test-goals-table',
            Key: {
              userId: mockUserId,
              goalId: mockGoalId,
            },
            ConditionExpression: 'userId = :userId',
            ExpressionAttributeValues: {
              ':userId': mockUserId,
            },
          },
        })
      );
    });
    it('should throw NotFoundError when goal does not exist', async () => {
      // Mock get operation returning no item
      mockSend.mockResolvedValueOnce({
        Item: undefined,
      });

      // Only test once since it will throw on the first send() call
      await expect(deleteGoal(mockUserId, mockGoalId)).rejects.toThrow(
        NotFoundError
      );
    });

    it('should throw DatabaseError for other DynamoDB errors', async () => {
      // Mock get operation failing
      const dynamoError = new Error('General database error');
      mockSend.mockRejectedValueOnce(dynamoError);

      await expect(deleteGoal(mockUserId, mockGoalId)).rejects.toThrow(
        DatabaseError
      );
    });
  });
});
