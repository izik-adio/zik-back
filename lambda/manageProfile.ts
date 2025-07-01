/**
 * Profile Management Lambda Handler - v1.1
 *
 * Handles all profile-related operations including:
 * - GET /profile - Fetch current user's profile
 * - POST /profile - Create/initialize profile
 * - PUT /profile - Update profile information
 * - PUT /profile/onboarding/complete - Mark onboarding as completed
 *
 * All endpoints require authentication via Cognito JWT token.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { randomUUID } from 'crypto';
import { verifyTokenAndGetUserId } from '../src/services/authService';
import {
  CognitoIdentityProviderClient,
  GetUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import {
  fetchUserProfile,
  createUserProfile,
  updateUserProfile,
  completeOnboarding,
  updateLastLogin,
} from '../src/services/database/users';
import { deleteUserAccount } from '../src/services/userDeletion';
import { CreateProfileRequest, UpdateProfileRequest } from '../src/types';
import { ValidationError, AuthError, DatabaseError } from '../src/utils/errors';
import { Logger } from '../src/utils/logger';
import {
  createSuccessResponse,
  createErrorResponse,
} from '../src/utils/responses';

// Initialize Cognito client for user data retrieval
const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

/**
 * Get user's email from Cognito using access token
 */
async function getUserEmailFromCognito(accessToken: string): Promise<string> {
  try {
    const command = new GetUserCommand({
      AccessToken: accessToken,
    });

    const response = await cognitoClient.send(command);
    const emailAttribute = response.UserAttributes?.find(
      (attr) => attr.Name === 'email'
    );

    if (!emailAttribute?.Value) {
      throw new ValidationError('Email not found in user profile');
    }

    return emailAttribute.Value;
  } catch (error) {
    Logger.error('Failed to get user email from Cognito', error);
    throw new AuthError('Unable to retrieve user email');
  }
}

/**
 * Main Lambda handler function for profile management operations
 */
export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const requestId = randomUUID();

  Logger.info('Profile management request received', {
    method: event.requestContext?.httpMethod || event.httpMethod,
    path: event.requestContext?.path || event.path,
    pathParameters: event.pathParameters,
    queryStringParameters: event.queryStringParameters,
    headers: event.headers,
    requestId,
    eventRaw: JSON.stringify(event),
  });

  try {
    // Extract and verify JWT token
    const authHeader =
      event.headers.authorization || event.headers.Authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      Logger.warn('Missing or invalid authorization header', { requestId });
      return createErrorResponse(
        401,
        'Missing or invalid authorization header',
        requestId
      );
    }

    const userId = await verifyTokenAndGetUserId(authHeader);
    if (!userId) {
      Logger.warn('Token verification failed', { requestId });
      return createErrorResponse(401, 'Invalid or expired token', requestId);
    }

    Logger.info('User authenticated', { userId, requestId });

    // Extract access token for Cognito API calls
    const accessToken = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Route by HTTP method and path (support both API Gateway v1 and v2 formats)
    const httpMethod =
      (event.requestContext as any)?.http?.method ||
      event.requestContext?.httpMethod ||
      event.httpMethod;
    const rawPath =
      (event as any).rawPath || event.requestContext?.path || event.path || '';

    // Handle different profile operations
    if (httpMethod === 'GET' && rawPath === '/profile') {
      return await handleGetProfile(userId, requestId);
    } else if (httpMethod === 'POST' && rawPath === '/profile') {
      return await handleCreateProfile(userId, event, requestId);
    } else if (httpMethod === 'PUT' && rawPath === '/profile') {
      return await handleUpdateProfile(userId, event, requestId);
    } else if (
      httpMethod === 'PUT' &&
      rawPath === '/profile/onboarding/complete'
    ) {
      return await handleCompleteOnboarding(userId, requestId);
    } else if (httpMethod === 'DELETE' && rawPath === '/profile') {
      return await handleDeleteProfile(userId, accessToken, requestId);
    } else {
      Logger.warn('Unsupported route', {
        httpMethod,
        rawPath,
        requestId,
      });
      return createErrorResponse(404, 'Profile endpoint not found', requestId);
    }
  } catch (error) {
    Logger.error('Profile management request failed', error, { requestId });

    if (
      error instanceof ValidationError ||
      (error as any)?.name === 'ValidationError'
    ) {
      return createErrorResponse(400, (error as Error).message, requestId);
    } else if (
      error instanceof AuthError ||
      (error as any)?.name === 'AuthError'
    ) {
      return createErrorResponse(401, (error as Error).message, requestId);
    } else if (
      error instanceof DatabaseError ||
      (error as any)?.name === 'DatabaseError'
    ) {
      return createErrorResponse(500, 'Database operation failed', requestId);
    } else {
      return createErrorResponse(500, 'Internal server error', requestId);
    }
  }
}

/**
 * Handles GET /profile - Fetch current user's profile
 */
async function handleGetProfile(
  userId: string,
  requestId: string
): Promise<APIGatewayProxyResult> {
  Logger.debug('Handling get profile request', { userId, requestId });

  // Update last login timestamp
  await updateLastLogin(userId);

  const profile = await fetchUserProfile(userId);

  if (!profile) {
    Logger.warn('Profile not found for authenticated user', {
      userId,
      requestId,
    });
    return createErrorResponse(404, 'Profile not found', requestId);
  }

  Logger.info('Profile fetched successfully', {
    userId,
    username: profile.username,
    requestId,
  });

  return createSuccessResponse(
    {
      profile,
    },
    requestId
  );
}

/**
 * Handles POST /profile - Create/initialize profile
 */
async function handleCreateProfile(
  userId: string,
  event: APIGatewayProxyEvent,
  requestId: string
): Promise<APIGatewayProxyResult> {
  Logger.debug('Handling create profile request', { userId, requestId });

  // Parse and validate request body
  let requestBody: CreateProfileRequest;
  try {
    if (!event.body) {
      throw new ValidationError('Request body is missing');
    }
    requestBody = JSON.parse(event.body);
  } catch (error) {
    Logger.warn('Invalid JSON in request body', { requestId, error });
    return createErrorResponse(
      400,
      'Invalid or missing request body',
      requestId
    );
  }

  const { username, firstName, lastName } = requestBody;
  if (!username) {
    return createErrorResponse(400, 'Username is required', requestId);
  }
  if (!firstName) {
    return createErrorResponse(400, 'First name is required', requestId);
  }
  if (!lastName) {
    return createErrorResponse(400, 'Last name is required', requestId);
  }

  // Get email from Cognito token claims
  let email: string;
  try {
    const accessToken = (
      event.headers.authorization ||
      event.headers.Authorization ||
      ''
    ).substring(7);
    email = await getUserEmailFromCognito(accessToken);
  } catch (error) {
    Logger.error('Failed to get email for new user', error, {
      userId,
      requestId,
    });
    return createErrorResponse(400, 'Email is required', requestId);
  }

  // Update last login timestamp
  await updateLastLogin(userId);

  const createdProfile = await createUserProfile(userId, email, requestBody);

  Logger.info('Profile created successfully', {
    userId,
    username: createdProfile.username,
    requestId,
  });

  return createSuccessResponse(
    {
      message: 'Profile created successfully',
      profile: createdProfile,
    },
    requestId
  );
}

/**
 * Handles PUT /profile - Update profile information
 */
async function handleUpdateProfile(
  userId: string,
  event: APIGatewayProxyEvent,
  requestId: string
): Promise<APIGatewayProxyResult> {
  Logger.debug('Handling update profile request', { userId, requestId });

  // Parse and validate request body
  let requestBody: UpdateProfileRequest;
  try {
    if (!event.body) {
      throw new ValidationError('Request body is missing');
    }
    requestBody = JSON.parse(event.body);
  } catch (error) {
    Logger.warn('Invalid JSON in request body', { requestId, error });
    return createErrorResponse(
      400,
      'Invalid or missing request body',
      requestId
    );
  }

  if (Object.keys(requestBody).length === 0) {
    return createErrorResponse(400, 'Request body cannot be empty.', requestId);
  }

  // Prevent sensitive fields from being updated
  const forbiddenFields = [
    'userId',
    'email',
    'onboardingCompleted',
    'createdAt',
    'lastLoginAt',
  ];
  for (const field of forbiddenFields) {
    if ((requestBody as any)[field]) {
      Logger.warn(`Attempt to update protected field '${field}' was blocked`, {
        userId,
        attemptedValue: (requestBody as any)[field],
        requestId,
      });
      delete (requestBody as any)[field];
    }
  }

  // Update last login timestamp
  await updateLastLogin(userId);

  const updatedProfile = await updateUserProfile(userId, requestBody);

  Logger.info('Profile updated successfully', { userId, requestId });

  return createSuccessResponse(
    {
      message: 'Profile updated successfully',
      profile: updatedProfile,
    },
    requestId
  );
}

/**
 * Handles PUT /profile/onboarding/complete - Mark onboarding as completed
 */
async function handleCompleteOnboarding(
  userId: string,
  requestId: string
): Promise<APIGatewayProxyResult> {
  Logger.debug('Handling complete onboarding request', { userId, requestId });

  // Update last login timestamp
  await updateLastLogin(userId);

  await completeOnboarding(userId);

  Logger.info('User onboarding marked as complete', { userId, requestId });

  return createSuccessResponse(
    {
      message: 'Onboarding completed successfully',
    },
    requestId
  );
}

/**
 * Handles DELETE /profile - Delete user account and all associated data
 */
async function handleDeleteProfile(
  userId: string,
  accessToken: string,
  requestId: string
): Promise<APIGatewayProxyResult> {
  Logger.debug('Handling delete profile request', { userId, requestId });

  try {
    const result = await deleteUserAccount(userId, accessToken);

    Logger.info('User account deleted successfully', { userId, requestId });

    return createSuccessResponse(
      {
        message: result,
      },
      requestId
    );
  } catch (error) {
    Logger.error('Failed to delete user account', error, { userId, requestId });

    if (error instanceof ValidationError) {
      return createErrorResponse(404, (error as Error).message, requestId);
    }

    return createErrorResponse(500, 'Failed to delete user account', requestId);
  }
}
