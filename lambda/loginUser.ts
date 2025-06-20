import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { createSuccessResponse, createErrorResponse } from './utils/response';
import {
  generateToken,
  generateRefreshToken,
  verifyPassword,
  checkAuthRateLimit,
} from './utils/auth';
import {
  getUserByEmail,
  updateLastLogin,
  addRefreshToken,
} from './utils/userDb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import * as bcrypt from 'bcryptjs';

const ddbClient = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

interface LoginRequest {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const DYNAMODB_TABLE_NAME = process.env.USERS_TABLE_NAME;
  const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h'; // Token expiration time

  if (!DYNAMODB_TABLE_NAME) {
    console.error('Missing environment variables: USERS_TABLE_NAME');
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Internal server error: Configuration missing',
      }),
      headers: { 'Content-Type': 'application/json' },
    };
  }
  try {
    if (!event.body) {
      return createErrorResponse(400, 'Missing request body');
    }

    const { email, password, rememberMe } = JSON.parse(
      event.body
    ) as LoginRequest;

    if (!email || !password) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Missing email or password' }),
        headers: { 'Content-Type': 'application/json' },
      };
    }

    // Rate limiting by IP
    const clientIp =
      event.requestContext?.identity?.sourceIp ||
      event.headers?.['x-forwarded-for'] ||
      'unknown';

    // Use relaxed rate limits for testing environment
    const isTestEnv =
      process.env.NODE_ENV === 'test' ||
      process.env.RELAX_RATE_LIMITS === 'true';
    const ipRateLimit = isTestEnv ? 50 : 5;
    const ipWindowMs = isTestEnv ? 60000 : 300000; // 1 minute vs 5 minutes

    if (!checkAuthRateLimit(clientIp, ipRateLimit, ipWindowMs)) {
      return createErrorResponse(
        429,
        'Too many login attempts. Please try again later.'
      );
    }

    // Rate limiting by email
    const emailRateLimit = isTestEnv ? 100 : 10;
    const emailWindowMs = isTestEnv ? 60000 : 600000; // 1 minute vs 10 minutes

    if (!checkAuthRateLimit(email, emailRateLimit, emailWindowMs)) {
      // 10 attempts per 10 minutes per email
      return createErrorResponse(
        429,
        'Too many login attempts for this account. Please try again later.'
      );
    }

    const queryCommand = new QueryCommand({
      TableName: DYNAMODB_TABLE_NAME,
      KeyConditionExpression: 'email = :email',
      ExpressionAttributeValues: {
        ':email': email,
      },
    });

    const { Items } = await ddbDocClient.send(queryCommand);

    if (!Items || Items.length === 0) {
      return {
        statusCode: 401,
        body: JSON.stringify({
          message: 'Invalid credentials (user not found)',
        }),
        headers: { 'Content-Type': 'application/json' },
      };
    }

    const user = Items[0];

    if (!user.isEmailVerified) {
      return {
        statusCode: 403, // Forbidden
        body: JSON.stringify({
          message: 'Email not verified. Please check your email.',
        }),
        headers: { 'Content-Type': 'application/json' },
      };
    }

    const isPasswordValid = await bcrypt.compare(password, user.hashedPassword);

    if (!isPasswordValid) {
      return {
        statusCode: 401,
        body: JSON.stringify({
          message: 'Invalid credentials (password mismatch)',
        }),
        headers: { 'Content-Type': 'application/json' },
      };
    } // Update last login
    await updateLastLogin(user.userId);

    // Generate tokens using auth utilities
    const accessToken = await generateToken(user.userId, user.email);
    const refreshToken = await generateRefreshToken(user.userId, user.email);

    // Store refresh token in database
    await addRefreshToken(user.userId, refreshToken);

    return createSuccessResponse(200, {
      message: 'Login successful',
      user: {
        userId: user.userId,
        email: user.email,
        userName: user.userName,
        isOnboarded: user.profile?.isOnboarded || false,
        focusAreas: user.profile?.focusAreas || [],
        initialGoal: user.profile?.initialGoal || '',
        isEmailVerified: user.isEmailVerified,
        lastLoginAt: user.lastLoginAt,
      },
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: JWT_EXPIRES_IN,
      },
    });
  } catch (error: any) {
    console.error('Error logging in user:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Internal server error';
    return createErrorResponse(500, 'Failed to login', errorMessage);
  }
};
