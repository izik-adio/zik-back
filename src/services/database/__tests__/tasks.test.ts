/**
 * Unit tests for Tasks database service
 * Tests all functions in isolation with mocked DynamoDB client
 */
import { jest } from '@jest/globals';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { fetchTodayTasks, createTask, deleteTask } from '../tasks';
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
    tasksTableName: 'test-tasks-table',
    userIdDueDateIndex: 'userId-dueDate-index',
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

// Get the mocked docClient
const { docClient } = require('../client');
const mockSend = docClient.send as jest.MockedFunction<typeof docClient.send>;

describe('Tasks Database Service', () => {
  const mockUserId = 'test-user-123';
  const mockTaskId = 'task-456';
  const mockDate = '2025-06-23';

  beforeEach(() => {
    jest.clearAllMocks();
    // Mock current date to be consistent
    jest
      .spyOn(Date.prototype, 'toISOString')
      .mockReturnValue('2025-06-23T10:00:00.000Z');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('fetchTodayTasks', () => {
    it('should successfully fetch today tasks using GSI', async () => {
      const mockTasks = [
        {
          userId: mockUserId,
          taskId: 'task-1',
          taskName: 'Test Task 1',
          dueDate: '2025-06-23',
          status: 'pending',
          priority: 'medium',
        },
        {
          userId: mockUserId,
          taskId: 'task-2',
          taskName: 'Test Task 2',
          dueDate: '2025-06-23',
          status: 'in-progress',
          priority: 'high',
        },
      ];

      mockSend.mockResolvedValueOnce({
        Items: mockTasks,
      });

      const result = await fetchTodayTasks(mockUserId);

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: {
            TableName: 'test-tasks-table',
            IndexName: 'userId-dueDate-index',
            KeyConditionExpression: 'userId = :userId AND dueDate = :dueDate',
            ExpressionAttributeValues: {
              ':userId': mockUserId,
              ':dueDate': '2025-06-23',
            },
          },
        })
      );
      expect(result).toEqual(mockTasks);
    });

    it('should return empty array when no tasks found', async () => {
      mockSend.mockResolvedValueOnce({
        Items: [],
      });

      const result = await fetchTodayTasks(mockUserId);

      expect(result).toEqual([]);
    });

    it('should throw DatabaseError when DynamoDB operation fails', async () => {
      const dynamoError = new Error('DynamoDB connection failed');
      mockSend.mockRejectedValueOnce(dynamoError);

      await expect(fetchTodayTasks(mockUserId)).rejects.toThrow(DatabaseError);
      await expect(fetchTodayTasks(mockUserId)).rejects.toThrow(
        'Failed to fetch today tasks'
      );
    });
  });

  describe('createTask', () => {
    it('should successfully create a new task with required fields', async () => {
      const taskData = {
        title: 'New Test Task',
        dueDate: '2025-06-25',
      };

      mockSend.mockResolvedValueOnce({}); // PutCommand response

      const result = await createTask(
        mockUserId,
        taskData.title,
        taskData.dueDate
      );

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: {
            TableName: 'test-tasks-table',
            Item: expect.objectContaining({
              userId: mockUserId,
              taskId: expect.any(String),
              taskName: taskData.title,
              dueDate: taskData.dueDate,
              status: 'pending',
              priority: 'medium',
              createdAt: expect.any(String),
              updatedAt: expect.any(String),
            }),
          },
        })
      );
      expect(typeof result).toBe('string');
      expect(result).toContain('Daily Quest created');
      expect(result).toContain(taskData.title);
    });
    it('should create task with optional epic quest ID', async () => {
      const epicId = 'epic-123';
      mockSend.mockResolvedValueOnce({});

      const result = await createTask(
        mockUserId,
        'Linked Task',
        '2025-06-25',
        epicId
      );

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: {
            TableName: 'test-tasks-table',
            Item: expect.objectContaining({
              goalId: epicId,
            }),
          },
        })
      );
      expect(typeof result).toBe('string');
      expect(result).toContain('Daily Quest created');
    });

    it('should throw ValidationError for invalid date format', async () => {
      await expect(
        createTask(mockUserId, 'Test Task', 'invalid-date')
      ).rejects.toThrow(ValidationError);
      await expect(
        createTask(mockUserId, 'Test Task', 'invalid-date')
      ).rejects.toThrow('Due date must be in YYYY-MM-DD format');
    });

    it('should throw DatabaseError when DynamoDB operation fails', async () => {
      const dynamoError = new Error('Write operation failed');
      mockSend.mockRejectedValueOnce(dynamoError);

      await expect(
        createTask(mockUserId, 'Test Task', '2025-06-25')
      ).rejects.toThrow(DatabaseError);
    });
  });

  describe('deleteTask', () => {
    it('should successfully delete a task', async () => {
      // First mock GetCommand to find the task
      mockSend.mockResolvedValueOnce({
        Item: { taskId: mockTaskId, taskName: 'Task to be deleted' },
      });

      // Then mock DeleteCommand to delete it
      mockSend.mockResolvedValueOnce({});

      const result = await deleteTask(mockUserId, mockTaskId);

      // Verify the first call (GetCommand)
      expect(mockSend).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          input: expect.objectContaining({
            TableName: 'test-tasks-table',
            Key: { userId: mockUserId, taskId: mockTaskId },
          }),
        })
      );

      // Verify the second call (DeleteCommand)
      expect(mockSend).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          input: expect.objectContaining({
            TableName: 'test-tasks-table',
            Key: { userId: mockUserId, taskId: mockTaskId },
            ConditionExpression: 'userId = :userId',
            ExpressionAttributeValues: { ':userId': mockUserId },
          }),
        })
      );

      // The implementation returns a message string, not the deleted item
      expect(typeof result).toBe('string');
      expect(result).toContain('Task to be deleted');
    });
    it('should throw NotFoundError when task does not exist', async () => {
      // Mock GetCommand returning no item, indicating task not found
      mockSend.mockResolvedValueOnce({ Item: null });

      // Only test once since the function will throw on the first send() call
      await expect(deleteTask(mockUserId, 'non-existent-task')).rejects.toThrow(
        NotFoundError
      );
    });

    it('should throw DatabaseError for other DynamoDB errors', async () => {
      const dynamoError = new Error('Delete operation failed');
      mockSend.mockRejectedValueOnce(dynamoError);

      await expect(deleteTask(mockUserId, mockTaskId)).rejects.toThrow(
        DatabaseError
      );
    });
  });
});
