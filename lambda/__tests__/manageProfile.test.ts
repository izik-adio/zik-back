/**
 * Integration tests for Profile Management Lambda Handler
 */
import { jest } from '@jest/globals';
import { APIGatewayProxyEvent } from 'aws-lambda';
import {
  CreateProfileRequest,
  UpdateProfileRequest,
  UserProfile,
} from '../../src/types';
import { ValidationError } from '../../src/utils/errors';

// Mock the services
const mockVerifyTokenAndGetUserId = jest.fn() as jest.MockedFunction<any>;
const mockFetchUserProfile = jest.fn() as jest.MockedFunction<any>;
const mockCreateUserProfile = jest.fn() as jest.MockedFunction<any>;
const mockUpdateUserProfile = jest.fn() as jest.MockedFunction<any>;
const mockCompleteOnboarding = jest.fn() as jest.MockedFunction<any>;
const mockUpdateLastLogin = jest.fn() as jest.MockedFunction<any>;

jest.mock('../../src/services/authService', () => ({
  verifyTokenAndGetUserId: mockVerifyTokenAndGetUserId,
}));

jest.mock('../../src/services/database/users', () => ({
  fetchUserProfile: mockFetchUserProfile,
  createUserProfile: mockCreateUserProfile,
  updateUserProfile: mockUpdateUserProfile,
  completeOnboarding: mockCompleteOnboarding,
  updateLastLogin: mockUpdateLastLogin,
}));

// Mock user deletion service
const mockDeleteUserAccount = jest.fn() as jest.MockedFunction<any>;
jest.mock('../../src/services/userDeletion', () => ({
  deleteUserAccount: mockDeleteUserAccount,
}));

// Mock logger
jest.mock('../../src/utils/logger', () => ({
  Logger: {
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

// Mock AWS Cognito client
const mockGetUser = jest.fn() as jest.MockedFunction<any>;
jest.mock('@aws-sdk/client-cognito-identity-provider', () => ({
  CognitoIdentityProviderClient: jest.fn().mockImplementation(() => ({
    send: mockGetUser,
  })),
  GetUserCommand: jest.fn(),
}));

// Import the handler after mocking
import { handler } from '../manageProfile';

describe('Profile Management Lambda Handler', () => {
  const mockUserId = 'test-user-123';
  const mockEmail = 'test@example.com';
  const validAuthHeader = 'Bearer valid-token';

  const mockUserProfile: UserProfile = {
    userId: mockUserId,
    username: 'testuser',
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

  const createMockEvent = (
    httpMethod: string,
    path: string,
    body?: any,
    headers: Record<string, string> = {}
  ): APIGatewayProxyEvent => ({
    httpMethod,
    path,
    body: body ? JSON.stringify(body) : null,
    headers: {
      Authorization: validAuthHeader,
      'Content-Type': 'application/json',
      ...headers,
    },
    requestContext: {
      httpMethod,
      path,
      accountId: 'test-account',
      apiId: 'test-api',
      requestId: 'test-request-id',
      stage: 'test',
      resourceId: 'test-resource',
      resourcePath: path,
      identity: {
        accessKey: null,
        accountId: null,
        apiKey: null,
        apiKeyId: null,
        caller: null,
        clientCert: null,
        cognitoAuthenticationProvider: null,
        cognitoAuthenticationType: null,
        cognitoIdentityId: null,
        cognitoIdentityPoolId: null,
        principalOrgId: null,
        sourceIp: '127.0.0.1',
        user: null,
        userAgent: 'test-agent',
        userArn: null,
      },
      protocol: 'HTTP/1.1',
      requestTime: '2025-06-27T10:00:00.000Z',
      requestTimeEpoch: 1719486000000,
      authorizer: {},
    },
    pathParameters: null,
    queryStringParameters: null,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    stageVariables: null,
    isBase64Encoded: false,
    resource: path,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyTokenAndGetUserId.mockResolvedValue(mockUserId);
    mockUpdateLastLogin.mockResolvedValue(undefined);

    // Mock Cognito getUserEmail response
    mockGetUser.mockResolvedValue({
      UserAttributes: [
        {
          Name: 'email',
          Value: mockEmail,
        },
      ],
    });
  });

  describe('GET /profile', () => {
    it('should fetch user profile successfully', async () => {
      mockFetchUserProfile.mockResolvedValueOnce(mockUserProfile);

      const event = createMockEvent('GET', '/profile');
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.data.profile).toEqual(mockUserProfile);
      expect(responseBody.success).toBe(true);
      expect(responseBody.timestamp).toBeDefined();
      expect(responseBody.requestId).toBeDefined();

      expect(mockVerifyTokenAndGetUserId).toHaveBeenCalledWith(validAuthHeader);
      expect(mockUpdateLastLogin).toHaveBeenCalledWith(mockUserId);
      expect(mockFetchUserProfile).toHaveBeenCalledWith(mockUserId);
    });

    it('should return 404 when profile not found', async () => {
      mockFetchUserProfile.mockResolvedValueOnce(null);

      const event = createMockEvent('GET', '/profile');
      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.success).toBe(false);
      expect(responseBody.error).toBe('Profile not found');
      expect(responseBody.timestamp).toBeDefined();
      expect(responseBody.requestId).toBeDefined();
    });

    it('should return 401 when authorization header is missing', async () => {
      const event = createMockEvent('GET', '/profile', null, {
        Authorization: '',
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.success).toBe(false);
      expect(responseBody.error).toBe(
        'Missing or invalid authorization header'
      );
      expect(responseBody.timestamp).toBeDefined();
      expect(responseBody.requestId).toBeDefined();
    });
  });

  describe('POST /profile', () => {
    const createRequest: CreateProfileRequest = {
      username: 'testuser',
      firstName: 'John',
      lastName: 'Doe',
      displayName: 'John Doe',
    };

    it('should create user profile successfully', async () => {
      mockCreateUserProfile.mockResolvedValueOnce(mockUserProfile);

      const event = createMockEvent('POST', '/profile', createRequest);
      // Simulate email from Cognito claims
      event.requestContext.authorizer = { claims: { email: mockEmail } };

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.success).toBe(true);
      expect(responseBody.data.message).toBe('Profile created successfully');
      expect(responseBody.data.profile).toEqual(mockUserProfile);
      expect(responseBody.timestamp).toBeDefined();
      expect(responseBody.requestId).toBeDefined();

      expect(mockVerifyTokenAndGetUserId).toHaveBeenCalledWith(validAuthHeader);
      expect(mockUpdateLastLogin).toHaveBeenCalledWith(mockUserId);
      expect(mockCreateUserProfile).toHaveBeenCalledWith(
        mockUserId,
        mockEmail,
        createRequest
      );
    });

    it('should return 400 when username is missing', async () => {
      const invalidRequest = { ...createRequest };
      delete (invalidRequest as any).username;

      const event = createMockEvent('POST', '/profile', invalidRequest);
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.success).toBe(false);
      expect(responseBody.error).toBe('Username is required');
      expect(responseBody.timestamp).toBeDefined();
      expect(responseBody.requestId).toBeDefined();
    });

    it('should return 400 when email is missing', async () => {
      // Mock Cognito to not return an email attribute
      mockGetUser.mockResolvedValueOnce({
        UserAttributes: [
          {
            Name: 'sub',
            Value: 'some-user-id',
          },
        ],
      });

      const event = createMockEvent('POST', '/profile', createRequest);
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.success).toBe(false);
      expect(responseBody.error).toBe('Email is required');
      expect(responseBody.timestamp).toBeDefined();
      expect(responseBody.requestId).toBeDefined();
    });

    it('should return 400 when JSON is invalid', async () => {
      const event = createMockEvent('POST', '/profile');
      event.body = 'invalid-json';

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.success).toBe(false);
      expect(responseBody.error).toBe('Invalid or missing request body');
      expect(responseBody.timestamp).toBeDefined();
      expect(responseBody.requestId).toBeDefined();
    });
  });

  describe('PUT /profile', () => {
    const updateRequest: UpdateProfileRequest = {
      firstName: 'Jane',
      displayName: 'Jane Doe',
    };

    it('should update user profile successfully', async () => {
      const updatedProfile = {
        ...mockUserProfile,
        firstName: 'Jane',
        displayName: 'Jane Doe',
      };
      mockUpdateUserProfile.mockResolvedValueOnce(updatedProfile);

      const event = createMockEvent('PUT', '/profile', updateRequest);
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.success).toBe(true);
      expect(responseBody.data.message).toBe('Profile updated successfully');
      expect(responseBody.data.profile).toEqual(updatedProfile);
      expect(responseBody.timestamp).toBeDefined();
      expect(responseBody.requestId).toBeDefined();

      expect(mockVerifyTokenAndGetUserId).toHaveBeenCalledWith(validAuthHeader);
      expect(mockUpdateLastLogin).toHaveBeenCalledWith(mockUserId);
      expect(mockUpdateUserProfile).toHaveBeenCalledWith(
        mockUserId,
        updateRequest
      );
    });

    it('should return 400 when no fields provided for update', async () => {
      const event = createMockEvent('PUT', '/profile', {});
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.success).toBe(false);
      expect(responseBody.error).toBe('Request body cannot be empty.');
      expect(responseBody.timestamp).toBeDefined();
      expect(responseBody.requestId).toBeDefined();
    });

    it('should return 400 when JSON is invalid', async () => {
      const event = createMockEvent('PUT', '/profile');
      event.body = 'invalid-json';

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.success).toBe(false);
      expect(responseBody.error).toBe('Invalid or missing request body');
      expect(responseBody.timestamp).toBeDefined();
      expect(responseBody.requestId).toBeDefined();
    });
  });

  describe('PUT /profile/onboarding/complete', () => {
    it('should complete onboarding successfully', async () => {
      mockCompleteOnboarding.mockResolvedValueOnce(undefined);

      const event = createMockEvent('PUT', '/profile/onboarding/complete');
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.success).toBe(true);
      expect(responseBody.data.message).toBe(
        'Onboarding completed successfully'
      );
      expect(responseBody.timestamp).toBeDefined();
      expect(responseBody.requestId).toBeDefined();

      expect(mockVerifyTokenAndGetUserId).toHaveBeenCalledWith(validAuthHeader);
      expect(mockUpdateLastLogin).toHaveBeenCalledWith(mockUserId);
      expect(mockCompleteOnboarding).toHaveBeenCalledWith(mockUserId);
    });
  });

  describe('DELETE /profile', () => {
    it('should delete user account successfully', async () => {
      const successMessage =
        'User account and all associated data have been permanently deleted';
      mockDeleteUserAccount.mockResolvedValueOnce(successMessage);

      const event = createMockEvent('DELETE', '/profile');
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.success).toBe(true);
      expect(responseBody.data.message).toBe(successMessage);
      expect(responseBody.timestamp).toBeDefined();
      expect(responseBody.requestId).toBeDefined();

      expect(mockVerifyTokenAndGetUserId).toHaveBeenCalledWith(validAuthHeader);
      expect(mockDeleteUserAccount).toHaveBeenCalledWith(
        mockUserId,
        'valid-token'
      );
    });

    it('should return 404 when user not found for deletion', async () => {
      mockDeleteUserAccount.mockRejectedValueOnce(
        new ValidationError('User profile not found')
      );

      const event = createMockEvent('DELETE', '/profile');
      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.success).toBe(false);
      expect(responseBody.error).toBe('User profile not found');
      expect(responseBody.timestamp).toBeDefined();
      expect(responseBody.requestId).toBeDefined();
    });

    it('should return 500 when deletion fails', async () => {
      mockDeleteUserAccount.mockRejectedValueOnce(new Error('Database error'));

      const event = createMockEvent('DELETE', '/profile');
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.success).toBe(false);
      expect(responseBody.error).toBe('Failed to delete user account');
      expect(responseBody.timestamp).toBeDefined();
      expect(responseBody.requestId).toBeDefined();
    });
  });

  describe('Unsupported routes', () => {
    it('should return 404 for unsupported method', async () => {
      const event = createMockEvent('PATCH', '/profile');
      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.success).toBe(false);
      expect(responseBody.error).toBe('Profile endpoint not found');
      expect(responseBody.timestamp).toBeDefined();
      expect(responseBody.requestId).toBeDefined();
    });

    it('should return 404 for unsupported path', async () => {
      const event = createMockEvent('GET', '/profile/unknown');
      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.success).toBe(false);
      expect(responseBody.error).toBe('Profile endpoint not found');
      expect(responseBody.timestamp).toBeDefined();
      expect(responseBody.requestId).toBeDefined();
    });
  });

  describe('Error handling', () => {
    it('should handle validation errors', async () => {
      const validationError = new Error('Username is already taken');
      validationError.name = 'ValidationError';
      mockCreateUserProfile.mockRejectedValueOnce(validationError);

      const requestBody = {
        username: 'testuser',
        firstName: 'John',
        lastName: 'Doe',
      };
      const event = createMockEvent('POST', '/profile', requestBody);
      // Simulate email from Cognito claims
      event.requestContext.authorizer = { claims: { email: mockEmail } };

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.success).toBe(false);
      expect(responseBody.error).toBe('Username is already taken');
      expect(responseBody.timestamp).toBeDefined();
      expect(responseBody.requestId).toBeDefined();
    });

    it('should handle database errors', async () => {
      const dbError = new Error('Database operation failed');
      dbError.name = 'DatabaseError';
      mockFetchUserProfile.mockRejectedValueOnce(dbError);

      const event = createMockEvent('GET', '/profile');
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.success).toBe(false);
      expect(responseBody.error).toBe('Database operation failed');
      expect(responseBody.timestamp).toBeDefined();
      expect(responseBody.requestId).toBeDefined();
    });

    it('should handle auth errors', async () => {
      const authError = new Error('Invalid token');
      authError.name = 'AuthError';
      mockVerifyTokenAndGetUserId.mockRejectedValueOnce(authError);

      const event = createMockEvent('GET', '/profile');
      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.success).toBe(false);
      expect(responseBody.error).toBe('Invalid token');
      expect(responseBody.timestamp).toBeDefined();
      expect(responseBody.requestId).toBeDefined();
    });

    it('should handle unexpected errors', async () => {
      const unexpectedError = new Error('Unexpected error');
      mockFetchUserProfile.mockRejectedValueOnce(unexpectedError);

      const event = createMockEvent('GET', '/profile');
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.success).toBe(false);
      expect(responseBody.error).toBe('Internal server error');
      expect(responseBody.timestamp).toBeDefined();
      expect(responseBody.requestId).toBeDefined();
    });
  });
});
