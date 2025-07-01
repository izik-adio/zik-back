/**
 * Unit tests for Users database service
 */
import { jest } from '@jest/globals';
import {
  UserProfile,
  CreateProfileRequest,
  UpdateProfileRequest,
} from '../../../types';
import { ValidationError, DatabaseError } from '../../../utils/errors';

// Mock DynamoDB client
const mockSend = jest.fn() as jest.MockedFunction<any>;
jest.mock('../client', () => ({
  docClient: {
    send: mockSend,
  },
}));

// Mock config
jest.mock('../../../config', () => ({
  config: {
    usersTableName: 'test-users-table',
    usernameIndex: 'username-index',
    emailIndex: 'email-index',
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

// Import the functions to test after mocking
import {
  fetchUserProfile,
  createUserProfile,
  updateUserProfile,
  isUsernameUnique,
  isEmailUnique,
  completeOnboarding,
  updateLastLogin,
  deleteUserProfile,
} from '../users';

describe('Users Database Service', () => {
  const mockUserId = 'test-user-123';
  const mockEmail = 'test@example.com';
  const mockUsername = 'testuser';

  const mockUserProfile: UserProfile = {
    userId: mockUserId,
    username: mockUsername,
    email: mockEmail,
    firstName: 'John',
    lastName: 'Doe',
    displayName: 'John Doe',
    preferences: {
      theme: 'light',
      notifications: {
        email: true,
        push: true,
        dailyReminders: true,
        weeklyDigest: true,
      },
      timezone: 'UTC',
      language: 'en',
      questCategories: [],
      privacySettings: {
        shareProgress: false,
        publicProfile: false,
      },
    },
    onboardingCompleted: false,
    createdAt: '2025-06-27T10:00:00.000Z',
    updatedAt: '2025-06-27T10:00:00.000Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('fetchUserProfile', () => {
    it('should fetch user profile successfully', async () => {
      mockSend.mockResolvedValueOnce({
        Item: mockUserProfile,
      });

      const result = await fetchUserProfile(mockUserId);

      expect(result).toEqual(mockUserProfile);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            TableName: 'test-users-table',
            Key: { userId: mockUserId },
          }),
        })
      );
    });

    it('should return null when user profile not found', async () => {
      mockSend.mockResolvedValueOnce({
        Item: undefined,
      });

      const result = await fetchUserProfile(mockUserId);

      expect(result).toBeNull();
    });

    it('should throw DatabaseError when fetch fails', async () => {
      const dynamoError = new Error('DynamoDB error');
      mockSend.mockRejectedValueOnce(dynamoError);

      await expect(fetchUserProfile(mockUserId)).rejects.toThrow(DatabaseError);
      await expect(fetchUserProfile(mockUserId)).rejects.toThrow(
        'Failed to fetch user profile'
      );
    });
  });

  describe('isUsernameUnique', () => {
    it('should return true when username is unique', async () => {
      mockSend.mockResolvedValueOnce({
        Items: [],
      });

      const result = await isUsernameUnique(mockUsername);

      expect(result).toBe(true);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            TableName: 'test-users-table',
            IndexName: 'username-index',
            KeyConditionExpression: 'username = :username',
            ExpressionAttributeValues: {
              ':username': mockUsername,
            },
          }),
        })
      );
    });

    it('should return false when username is taken', async () => {
      mockSend.mockResolvedValueOnce({
        Items: [{ userId: 'other-user-id' }],
      });

      const result = await isUsernameUnique(mockUsername);

      expect(result).toBe(false);
    });

    it('should return true when username belongs to excluded user', async () => {
      mockSend.mockResolvedValueOnce({
        Items: [{ userId: mockUserId }],
      });

      const result = await isUsernameUnique(mockUsername, mockUserId);

      expect(result).toBe(true);
    });

    it('should throw DatabaseError when check fails', async () => {
      const dynamoError = new Error('DynamoDB error');
      mockSend.mockRejectedValueOnce(dynamoError);

      await expect(isUsernameUnique(mockUsername)).rejects.toThrow(
        DatabaseError
      );
    });
  });

  describe('isEmailUnique', () => {
    it('should return true when email is unique', async () => {
      mockSend.mockResolvedValueOnce({
        Items: [],
      });

      const result = await isEmailUnique(mockEmail);

      expect(result).toBe(true);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            TableName: 'test-users-table',
            IndexName: 'email-index',
            KeyConditionExpression: 'email = :email',
            ExpressionAttributeValues: {
              ':email': mockEmail.toLowerCase(),
            },
          }),
        })
      );
    });

    it('should return false when email is taken', async () => {
      mockSend.mockResolvedValueOnce({
        Items: [{ userId: 'other-user-id' }],
      });

      const result = await isEmailUnique(mockEmail);

      expect(result).toBe(false);
    });
  });

  describe('createUserProfile', () => {
    const createRequest: CreateProfileRequest = {
      username: mockUsername,
      firstName: 'John',
      lastName: 'Doe',
      displayName: 'John Doe',
    };

    it('should create user profile successfully', async () => {
      // Mock uniqueness checks
      mockSend.mockResolvedValueOnce({ Items: [] }); // username unique
      mockSend.mockResolvedValueOnce({ Items: [] }); // email unique

      // Mock profile creation
      mockSend.mockResolvedValueOnce({});

      const result = await createUserProfile(
        mockUserId,
        mockEmail,
        createRequest
      );

      expect(result.userId).toBe(mockUserId);
      expect(result.username).toBe(mockUsername);
      expect(result.email).toBe(mockEmail.toLowerCase());
      expect(result.firstName).toBe('John');
      expect(result.lastName).toBe('Doe');
      expect(result.onboardingCompleted).toBe(false);
    });

    it('should throw ValidationError when username is empty', async () => {
      const invalidRequest = { ...createRequest, username: '' };

      await expect(
        createUserProfile(mockUserId, mockEmail, invalidRequest)
      ).rejects.toThrow(ValidationError);
      await expect(
        createUserProfile(mockUserId, mockEmail, invalidRequest)
      ).rejects.toThrow('Username is required and cannot be empty');
    });

    it('should throw ValidationError when username format is invalid', async () => {
      const invalidRequest = { ...createRequest, username: 'ab' }; // too short

      await expect(
        createUserProfile(mockUserId, mockEmail, invalidRequest)
      ).rejects.toThrow(ValidationError);
      await expect(
        createUserProfile(mockUserId, mockEmail, invalidRequest)
      ).rejects.toThrow('Username must be 3-30 characters');
    });

    it('should throw ValidationError when username is not unique', async () => {
      // Mock username not unique, email unique
      mockSend.mockResolvedValueOnce({ Items: [{ userId: 'other-user' }] }); // username check
      mockSend.mockResolvedValueOnce({ Items: [] }); // email check

      await expect(
        createUserProfile(mockUserId, mockEmail, createRequest)
      ).rejects.toThrow('Username is already taken');
    });

    it('should throw ValidationError when email is not unique', async () => {
      // Mock username unique but email not unique
      mockSend.mockResolvedValueOnce({ Items: [] }); // username check
      mockSend.mockResolvedValueOnce({ Items: [{ userId: 'other-user' }] }); // email check

      await expect(
        createUserProfile(mockUserId, mockEmail, createRequest)
      ).rejects.toThrow('Email is already registered');
    });
  });

  describe('updateUserProfile', () => {
    const updateRequest: UpdateProfileRequest = {
      firstName: 'Jane',
      displayName: 'Jane Doe',
    };

    it('should update user profile successfully', async () => {
      // Mock fetch current profile
      mockSend.mockResolvedValueOnce({
        Item: mockUserProfile,
      });

      // Mock update
      mockSend.mockResolvedValueOnce({
        Attributes: {
          ...mockUserProfile,
          firstName: 'Jane',
          displayName: 'Jane Doe',
        },
      });

      const result = await updateUserProfile(mockUserId, updateRequest);

      expect(result.firstName).toBe('Jane');
      expect(result.displayName).toBe('Jane Doe');
    });

    it('should throw ValidationError when profile not found', async () => {
      // Mock fetchUserProfile to return null
      mockSend.mockResolvedValueOnce({
        Item: undefined, // This makes fetchUserProfile return null
      });

      await expect(
        updateUserProfile(mockUserId, updateRequest)
      ).rejects.toThrow('User profile not found');
    });

    it('should check username uniqueness when updating username', async () => {
      const updateWithUsername = { ...updateRequest, username: 'newusername' };

      // Mock fetch current profile
      mockSend.mockResolvedValueOnce({
        Item: mockUserProfile,
      });

      // Mock username uniqueness check
      mockSend.mockResolvedValueOnce({ Items: [] });

      // Mock update
      mockSend.mockResolvedValueOnce({
        Attributes: {
          ...mockUserProfile,
          username: 'newusername',
        },
      });

      const result = await updateUserProfile(mockUserId, updateWithUsername);

      expect(result.username).toBe('newusername');
    });
  });

  describe('completeOnboarding', () => {
    it('should mark onboarding as completed', async () => {
      mockSend.mockResolvedValueOnce({});

      await completeOnboarding(mockUserId);

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            TableName: 'test-users-table',
            Key: { userId: mockUserId },
            UpdateExpression:
              'SET onboardingCompleted = :completed, updatedAt = :updatedAt',
          }),
        })
      );
    });

    it('should throw ValidationError when user not found', async () => {
      const conditionalError = new Error('ConditionalCheckFailedException');
      conditionalError.name = 'ConditionalCheckFailedException';
      mockSend.mockRejectedValueOnce(conditionalError);

      await expect(completeOnboarding(mockUserId)).rejects.toThrow(
        'User profile not found'
      );
    });
  });

  describe('updateLastLogin', () => {
    it('should update last login timestamp', async () => {
      mockSend.mockResolvedValueOnce({});

      await updateLastLogin(mockUserId);

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            TableName: 'test-users-table',
            Key: { userId: mockUserId },
            UpdateExpression: 'SET lastLoginAt = :lastLoginAt',
          }),
        })
      );
    });

    it('should not throw error when update fails', async () => {
      const dynamoError = new Error('DynamoDB error');
      mockSend.mockRejectedValueOnce(dynamoError);

      // Should not throw
      await expect(updateLastLogin(mockUserId)).resolves.toBeUndefined();
    });
  });

  describe('deleteUserProfile', () => {
    it('should permanently delete user profile', async () => {
      mockSend.mockResolvedValueOnce({});

      await deleteUserProfile(mockUserId);

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            TableName: 'test-users-table',
            Key: { userId: mockUserId },
            ConditionExpression: 'attribute_exists(userId)',
          }),
        })
      );
    });

    it('should throw ValidationError when user not found', async () => {
      const conditionalError = new Error('ConditionalCheckFailedException');
      conditionalError.name = 'ConditionalCheckFailedException';
      mockSend.mockRejectedValueOnce(conditionalError);

      await expect(deleteUserProfile(mockUserId)).rejects.toThrow(
        'User profile not found'
      );
    });

    it('should throw DatabaseError on other failures', async () => {
      const dynamoError = new Error('DynamoDB error');
      mockSend.mockRejectedValueOnce(dynamoError);

      await expect(deleteUserProfile(mockUserId)).rejects.toThrow(
        'Failed to delete user profile'
      );
    });
  });
});
