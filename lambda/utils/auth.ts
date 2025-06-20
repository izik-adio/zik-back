import * as jwt from 'jsonwebtoken';
import * as bcrypt from 'bcryptjs';
import { APIGatewayProxyEvent } from 'aws-lambda';
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';
import { createErrorResponse } from './response';

export interface JWTPayload {
  userId: string;
  email: string;
  iat?: number;
  exp?: number;
}

export interface AuthResult {
  userId: string;
  email: string;
}

const JWT_SECRET_ARN = process.env.JWT_SECRET_ARN;
let jwtSecretValue: string | undefined;

const secretsManagerClient = new SecretsManagerClient({});

async function getJwtSecret(): Promise<string> {
  if (jwtSecretValue) {
    return jwtSecretValue;
  }
  if (!JWT_SECRET_ARN) {
    throw new Error('JWT_SECRET_ARN environment variable is not set.');
  }
  const command = new GetSecretValueCommand({ SecretId: JWT_SECRET_ARN });
  const data = await secretsManagerClient.send(command);
  if (data.SecretString) {
    const secret = JSON.parse(data.SecretString);
    jwtSecretValue = secret.JWT_SECRET; // Assuming the key in Secrets Manager is JWT_SECRET
    if (!jwtSecretValue) {
      throw new Error(
        'JWT_SECRET not found in the fetched secret from Secrets Manager.'
      );
    }
    return jwtSecretValue;
  } else {
    throw new Error('SecretString not found in AWS Secrets Manager response.');
  }
}
const JWT_EXPIRES_IN_STRING = process.env.JWT_EXPIRES_IN || '28d'; // Changed from 7d
const REFRESH_TOKEN_EXPIRES_IN_STRING =
  process.env.REFRESH_TOKEN_EXPIRES_IN || '90d'; // Changed from 30d

/**
 * Generate JWT token for user
 */
export const generateToken = async (
  userId: string,
  email: string
): Promise<string> => {
  const secret = await getJwtSecret();
  return jwt.sign(
    { userId, email },
    secret as jwt.Secret,
    {
      expiresIn: JWT_EXPIRES_IN_STRING,
    } as jwt.SignOptions
  ); // Use constant and explicitly type options
};

/**
 * Generate refresh token for user
 */
export const generateRefreshToken = async (
  userId: string,
  email: string
): Promise<string> => {
  const secret = await getJwtSecret();
  return jwt.sign(
    { userId, email, type: 'refresh' },
    secret as jwt.Secret,
    {
      expiresIn: REFRESH_TOKEN_EXPIRES_IN_STRING, // Use constant
    } as jwt.SignOptions
  ); // Explicitly type options
};

/**
 * Verify and decode JWT token
 */
export const verifyToken = async (token: string): Promise<JWTPayload> => {
  try {
    const secret = await getJwtSecret();
    const decoded = jwt.verify(token, secret) as JWTPayload;

    // Check if this is a refresh token being used as access token
    if ((decoded as any).type === 'refresh') {
      throw new Error('Refresh token cannot be used for API access');
    }

    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('Token has expired');
    } else if (error instanceof jwt.JsonWebTokenError) {
      throw new Error('Invalid token');
    }
    throw error;
  }
};

/**
 * Verify refresh token
 */
export const verifyRefreshToken = async (
  token: string
): Promise<JWTPayload> => {
  try {
    const secret = await getJwtSecret();
    const decoded = jwt.verify(token, secret) as JWTPayload & {
      type?: string;
    };

    if (decoded.type !== 'refresh') {
      throw new Error('Invalid refresh token');
    }

    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('Refresh token has expired');
    } else if (error instanceof jwt.JsonWebTokenError) {
      throw new Error('Invalid refresh token');
    }
    throw error;
  }
};

/**
 * Extract and verify authorization header from API Gateway event
 */
export const extractAuthFromEvent = async (
  event: APIGatewayProxyEvent
): Promise<AuthResult> => {
  const authHeader = event.headers.authorization || event.headers.Authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing or invalid authorization header');
  }

  const token = authHeader.substring(7);
  const decoded = await verifyToken(token);

  return {
    userId: decoded.userId,
    email: decoded.email,
  };
};

/**
 * Hash password
 */
export const hashPassword = async (password: string): Promise<string> => {
  const saltRounds = 12;
  return bcrypt.hash(password, saltRounds);
};

/**
 * Verify password
 */
export const verifyPassword = async (
  password: string,
  hashedPassword: string
): Promise<boolean> => {
  return bcrypt.compare(password, hashedPassword);
};

/**
 * Verify password complexity (e.g., minimum length)
 */
export const verifyPasswordComplexity = (password: string): boolean => {
  // Example: Check for minimum length. This can be expanded with more rules.
  return password.length >= 8;
};

/**
 * Rate limiting for auth operations
 */
const authAttempts = new Map<string, { count: number; resetTime: number }>();

export const checkAuthRateLimit = (
  identifier: string,
  maxAttempts: number = 5,
  windowMs: number = 300000
): boolean => {
  const now = Date.now();
  const windowStart = now - windowMs;

  const existing = authAttempts.get(identifier);

  if (!existing || existing.resetTime < windowStart) {
    // Reset or initialize
    authAttempts.set(identifier, { count: 1, resetTime: now + windowMs });
    return true;
  }

  if (existing.count >= maxAttempts) {
    return false;
  }

  existing.count++;
  return true;
};

/**
 * Middleware to extract auth from event and add to context
 */
export const withAuth = (
  handler: (event: APIGatewayProxyEvent, auth: AuthResult) => Promise<any>
) => {
  return async (event: APIGatewayProxyEvent) => {
    try {
      const auth = await extractAuthFromEvent(event);
      return await handler(event, auth);
    } catch (error) {
      console.error('Authentication error:', error);
      const message =
        error instanceof Error ? error.message : 'Authentication failed';
      return createErrorResponse(401, 'Unauthorized', message);
    }
  };
};
