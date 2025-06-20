import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { createErrorResponse } from './response';

export interface CognitoUser {
  userId: string; // sub claim from Cognito
  email: string;
  firstName?: string;
  lastName?: string;
  emailVerified: boolean;
  isOnboarded?: boolean;
  focusAreas?: string[];
  initialGoal?: string;
}

/**
 * Extract user information from Cognito JWT token in API Gateway event
 */
export const getCognitoUser = (
  event: APIGatewayProxyEvent
): CognitoUser | null => {
  try {
    // In API Gateway with Cognito authorizer, user claims are available in requestContext
    const claims = event.requestContext.authorizer?.jwt?.claims;

    if (!claims) {
      console.error('No JWT claims found in request context');
      return null;
    }

    // Extract standard claims
    const userId = claims.sub as string;
    const email = claims.email as string;
    const emailVerified = claims.email_verified === 'true';

    // Extract name information
    const firstName = claims.given_name as string;
    const lastName = claims.family_name as string;

    // Extract custom attributes (Cognito prefixes custom attributes with 'custom:')
    const isOnboarded = claims['custom:isOnboarded'] === 'true';
    const focusAreasString = claims['custom:focusAreas'] as string;
    const initialGoal = claims['custom:initialGoal'] as string;

    // Parse focus areas if they exist
    let focusAreas: string[] = [];
    if (focusAreasString) {
      try {
        focusAreas = JSON.parse(focusAreasString);
      } catch (parseError) {
        console.warn(
          'Failed to parse focusAreas from Cognito claims:',
          parseError
        );
        focusAreas = [];
      }
    }

    return {
      userId,
      email,
      firstName,
      lastName,
      emailVerified,
      isOnboarded,
      focusAreas,
      initialGoal,
    };
  } catch (error) {
    console.error('Error extracting Cognito user from event:', error);
    return null;
  }
};

// Export alias for backward compatibility
export const getCognitoUserFromEvent = getCognitoUser;

/**
 * Check if the request has valid Cognito authorization
 */
export const isAuthorized = (event: APIGatewayProxyEvent): boolean => {
  return !!event.requestContext.authorizer?.jwt?.claims?.sub;
};

/**
 * Get user ID from Cognito JWT (convenience function)
 */
export const getUserId = (event: APIGatewayProxyEvent): string | null => {
  try {
    return (
      (event.requestContext.authorizer?.jwt?.claims?.sub as string) || null
    );
  } catch (error) {
    console.error('Error extracting user ID from Cognito token:', error);
    return null;
  }
};

/**
 * Middleware to extract Cognito user from event and add to context
 */
export const withCognitoAuth = (
  handler: (
    event: APIGatewayProxyEvent,
    cognitoUser: CognitoUser
  ) => Promise<APIGatewayProxyResult>
) => {
  return async (
    event: APIGatewayProxyEvent
  ): Promise<APIGatewayProxyResult> => {
    try {
      const cognitoUser = getCognitoUser(event);

      if (!cognitoUser) {
        console.error('Failed to extract Cognito user from event');
        return createErrorResponse(
          401,
          'Unauthorized',
          'Invalid or missing authentication'
        );
      }

      return await handler(event, cognitoUser);
    } catch (error) {
      console.error('Cognito authentication error:', error);
      const message =
        error instanceof Error ? error.message : 'Authentication failed';
      return createErrorResponse(401, 'Unauthorized', message);
    }
  };
};

/**
 * Rate limiting helper (can be used with Cognito user ID)
 */
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

export const checkRateLimit = (
  identifier: string,
  maxRequests: number,
  windowMs: number
): boolean => {
  const now = Date.now();
  const entry = rateLimitStore.get(identifier);

  if (!entry || now > entry.resetTime) {
    rateLimitStore.set(identifier, { count: 1, resetTime: now + windowMs });
    return true;
  }

  if (entry.count >= maxRequests) {
    return false;
  }

  entry.count++;
  return true;
};

/**
 * Clean up expired rate limit entries (call periodically)
 */
export const cleanupRateLimit = (): void => {
  const now = Date.now();
  const keysToDelete: string[] = [];

  rateLimitStore.forEach((entry, key) => {
    if (now > entry.resetTime) {
      keysToDelete.push(key);
    }
  });

  keysToDelete.forEach((key) => rateLimitStore.delete(key));
};
