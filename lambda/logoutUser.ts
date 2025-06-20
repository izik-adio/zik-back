import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { createSuccessResponse, createErrorResponse } from './utils/response';
import { withAuth } from './utils/auth';
import { removeRefreshToken, removeAllRefreshTokens } from './utils/userDb';

interface LogoutRequest {
  refreshToken?: string;
  logoutAll?: boolean;
}

export const handler = withAuth(
  async (event: APIGatewayProxyEvent, auth): Promise<APIGatewayProxyResult> => {
    try {
      let requestData: LogoutRequest = {};

      if (event.body) {
        try {
          requestData = JSON.parse(event.body);
        } catch (parseError) {
          return createErrorResponse(400, 'Invalid JSON in request body');
        }
      }

      const { refreshToken, logoutAll } = requestData;

      if (logoutAll) {
        // Logout from all devices - clear all refresh tokens
        await removeAllRefreshTokens(auth.userId);
        return createSuccessResponse(200, {
          message: 'Logged out from all devices successfully',
        });
      } else if (refreshToken) {
        // Logout from specific device - remove specific refresh token
        await removeRefreshToken(auth.userId, refreshToken);

        return createSuccessResponse(200, {
          message: 'Logged out successfully',
        });
      } else {
        // Basic logout - just return success (token will expire naturally)
        return createSuccessResponse(200, {
          message: 'Logged out successfully',
        });
      }
    } catch (error: any) {
      console.error('Error logging out user:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Internal server error';
      return createErrorResponse(500, 'Failed to logout', errorMessage);
    }
  }
);
