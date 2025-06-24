/**
 * Authentication service for JWT token validation
 *
 * This service handles all authentication logic for the Zik backend,
 * including JWT token verification using AWS Cognito and user ID extraction.
 */
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { config } from '../config';
import { AuthError, ValidationError } from '../utils/errors';
import { Logger } from '../utils/logger';

// JWT Verifier for Cognito tokens
const jwtVerifier = CognitoJwtVerifier.create({
  userPoolId: config.userPoolId,
  tokenUse: 'access',
  clientId: config.userPoolClientId,
});

/**
 * Validates JWT token and extracts userId from Cognito claims
 *
 * This function performs comprehensive JWT validation including:
 * - Authorization header format validation
 * - Token signature verification against Cognito User Pool
 * - Token expiration checking
 * - User ID (sub claim) extraction
 *
 * @param authorizationHeader - Authorization header from API Gateway event (format: "Bearer <token>")
 * @returns Promise<string> - The userId (sub claim) from the validated token
 * @throws AuthError - If token is invalid, expired, or missing required claims
 * @throws ValidationError - If authorization header is malformed or missing
 */
export async function verifyTokenAndGetUserId(
  authorizationHeader?: string
): Promise<string> {
  // Validate authorization header format
  if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
    throw new ValidationError('Missing or invalid Authorization header');
  }

  const token = authorizationHeader.substring(7); // Remove 'Bearer ' prefix
  try {
    Logger.debug('Validating JWT token', {
      tokenPrefix: token.substring(0, 20) + '...',
    });

    const payload = await jwtVerifier.verify(token);
    const userId = payload.sub;

    if (!userId) {
      throw new AuthError('Token does not contain valid user ID');
    }

    Logger.info('JWT token validated successfully', { userId });
    return userId;
  } catch (error) {
    Logger.error('JWT token validation failed', error);

    // If it's already an AuthError, re-throw it
    if (error instanceof AuthError) {
      throw error;
    }

    // Otherwise, throw a generic error
    throw new AuthError('Invalid or expired token');
  }
}
