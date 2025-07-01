/**
 * Tests for user deletion service
 */
import { deleteUserAccount } from '../userDeletion';
import { docClient } from '../database/client';
import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { config } from '../../config';
import { ValidationError, DatabaseError } from '../../utils/errors';

// Mock dependencies
jest.mock('../database/client');
jest.mock('@aws-sdk/client-cognito-identity-provider');
jest.mock('../../utils/logger', () => ({
  Logger: {
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

// Mock config
jest.mock('../../config', () => ({
  config: {
    usersTableName: 'test-users-table',
    chatMessagesTableName: 'test-chat-messages-table',
    goalsTableName: 'test-goals-table',
    tasksTableName: 'test-tasks-table',
    recurrenceRulesTableName: 'test-recurrence-rules-table',
    milestonesTableName: 'test-milestones-table',
    userPoolId: 'test-user-pool',
    awsRegion: 'us-east-1',
  },
}));

const mockSend = jest.fn();
const mockCognitoSend = jest.fn();

(docClient.send as jest.Mock) = mockSend;
(CognitoIdentityProviderClient as jest.Mock).mockImplementation(() => ({
  send: mockCognitoSend,
}));

describe('deleteUserAccount', () => {
  const mockUserId = 'test-user-123';
  const mockAccessToken = 'test-access-token';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should delete user account and all data successfully', async () => {
    // Mock user exists check
    mockSend.mockResolvedValueOnce({
      Items: [{ userId: mockUserId }],
    });

    // Mock deletion queries for 5 tables (return empty results for clean deletion)
    mockSend.mockResolvedValueOnce({ Items: [], LastEvaluatedKey: undefined }); // chat messages
    mockSend.mockResolvedValueOnce({ Items: [], LastEvaluatedKey: undefined }); // goals
    mockSend.mockResolvedValueOnce({ Items: [], LastEvaluatedKey: undefined }); // tasks
    mockSend.mockResolvedValueOnce({ Items: [], LastEvaluatedKey: undefined }); // recurrence rules
    mockSend.mockResolvedValueOnce({ Items: [], LastEvaluatedKey: undefined }); // milestones

    // Mock profile deletion
    mockSend.mockResolvedValueOnce({});

    // Mock Cognito deletion
    mockCognitoSend.mockResolvedValueOnce({});

    const result = await deleteUserAccount(mockUserId, mockAccessToken);

    expect(result).toBe(
      'User account and all associated data have been permanently deleted'
    );
    // Should call DynamoDB multiple times for user data deletion
    expect(mockSend).toHaveBeenCalled();
  });

  it('should throw ValidationError when user not found', async () => {
    // Mock user not exists
    mockSend.mockResolvedValueOnce({
      Items: [],
    });

    await expect(
      deleteUserAccount(mockUserId, mockAccessToken)
    ).rejects.toThrow(ValidationError);
    await expect(
      deleteUserAccount(mockUserId, mockAccessToken)
    ).rejects.toThrow('User profile not found');
  });

  it('should continue deletion even if some data tables fail', async () => {
    // Mock user exists check
    mockSend.mockImplementationOnce(() =>
      Promise.resolve({
        Items: [{ userId: mockUserId }],
      })
    );

    // Mock some table deletions fail, others succeed
    mockSend
      .mockRejectedValueOnce(new Error('Chat messages deletion failed'))
      .mockResolvedValueOnce({ Items: [], LastEvaluatedKey: undefined })
      .mockResolvedValueOnce({ Items: [], LastEvaluatedKey: undefined })
      .mockResolvedValueOnce({ Items: [], LastEvaluatedKey: undefined })
      .mockResolvedValueOnce({ Items: [], LastEvaluatedKey: undefined })
      .mockResolvedValueOnce({}); // Profile deletion

    // Mock Cognito deletion
    mockCognitoSend.mockResolvedValueOnce({});

    const result = await deleteUserAccount(mockUserId, mockAccessToken);

    expect(result).toBe(
      'User account and all associated data have been permanently deleted'
    );
  });

  it('should continue even if Cognito deletion fails', async () => {
    // Mock user exists check
    mockSend.mockImplementationOnce(() =>
      Promise.resolve({
        Items: [{ userId: mockUserId }],
      })
    );

    // Mock successful table deletions
    mockSend.mockImplementation(() =>
      Promise.resolve({
        Items: [],
        LastEvaluatedKey: undefined,
      })
    );

    // Mock Cognito deletion failure
    mockCognitoSend.mockRejectedValueOnce(new Error('Cognito deletion failed'));

    const result = await deleteUserAccount(mockUserId, mockAccessToken);

    expect(result).toBe(
      'User account and all associated data have been permanently deleted'
    );
  });

  it('should throw DatabaseError when profile deletion fails', async () => {
    // Mock user exists check
    mockSend.mockImplementationOnce(() =>
      Promise.resolve({
        Items: [{ userId: mockUserId }],
      })
    );

    // Mock table deletions succeed but profile deletion fails
    mockSend
      .mockResolvedValueOnce({ Items: [], LastEvaluatedKey: undefined })
      .mockResolvedValueOnce({ Items: [], LastEvaluatedKey: undefined })
      .mockResolvedValueOnce({ Items: [], LastEvaluatedKey: undefined })
      .mockResolvedValueOnce({ Items: [], LastEvaluatedKey: undefined })
      .mockResolvedValueOnce({ Items: [], LastEvaluatedKey: undefined })
      .mockRejectedValueOnce(new Error('Profile deletion failed'));

    await expect(
      deleteUserAccount(mockUserId, mockAccessToken)
    ).rejects.toThrow(DatabaseError);
  });

  it('should handle tables with data correctly', async () => {
    // Mock user exists check
    mockSend.mockResolvedValueOnce({
      Items: [{ userId: mockUserId }],
    });

    // Mock chat messages table with data
    mockSend.mockResolvedValueOnce({
      Items: [
        { userId: mockUserId, messageId: 'msg1' },
        { userId: mockUserId, messageId: 'msg2' },
      ],
      LastEvaluatedKey: undefined,
    });
    mockSend.mockResolvedValueOnce({}); // Delete msg1
    mockSend.mockResolvedValueOnce({}); // Delete msg2

    // Other tables empty
    mockSend.mockResolvedValueOnce({ Items: [], LastEvaluatedKey: undefined }); // goals
    mockSend.mockResolvedValueOnce({ Items: [], LastEvaluatedKey: undefined }); // tasks
    mockSend.mockResolvedValueOnce({ Items: [], LastEvaluatedKey: undefined }); // recurrence rules
    mockSend.mockResolvedValueOnce({ Items: [], LastEvaluatedKey: undefined }); // milestones

    // Profile deletion
    mockSend.mockResolvedValueOnce({});

    // Mock Cognito deletion
    mockCognitoSend.mockResolvedValueOnce({});

    const result = await deleteUserAccount(mockUserId, mockAccessToken);

    expect(result).toBe(
      'User account and all associated data have been permanently deleted'
    );
    // Should call DynamoDB multiple times for queries and deletes
    expect(mockSend).toHaveBeenCalled();
  });
});
