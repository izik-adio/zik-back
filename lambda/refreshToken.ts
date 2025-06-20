import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { createSuccessResponse, createErrorResponse } from './utils/response';
import {
  generateToken,
  generateRefreshToken,
  verifyRefreshToken,
} from './utils/auth';
import {
  getUserById,
  addRefreshToken,
  removeRefreshToken,
} from './utils/userDb';

interface RefreshTokenRequest {
  refreshToken: string;
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    if (!event.body) {
      return createErrorResponse(400, 'Missing request body');
    }

    let requestData: RefreshTokenRequest;
    try {
      requestData = JSON.parse(event.body);
    } catch (parseError) {
      return createErrorResponse(400, 'Invalid JSON in request body');
    }

    const { refreshToken } = requestData;

    if (!refreshToken) {
      return createErrorResponse(400, 'Refresh token is required');
    } // Verify refresh token
    let decoded;
    try {
      decoded = await verifyRefreshToken(refreshToken);
    } catch (error: any) {
      return createErrorResponse(401, 'Invalid or expired refresh token');
    }

    // Get user
    const user = await getUserById(decoded.userId);
    if (!user) {
      return createErrorResponse(401, 'User not found');
    }

    // Check if refresh token exists in user's token list
    if (!user.refreshTokens || !user.refreshTokens.includes(refreshToken)) {
      return createErrorResponse(401, 'Refresh token not found or revoked');
    }

    // Generate new tokens
    const newAccessToken = await generateToken(user.userId, user.email);
    const newRefreshToken = await generateRefreshToken(user.userId, user.email);

    // Remove old refresh token and add new one
    await removeRefreshToken(user.userId, refreshToken);
    await addRefreshToken(user.userId, newRefreshToken);

    return createSuccessResponse(200, {
      message: 'Tokens refreshed successfully',
      tokens: {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        expiresIn: process.env.JWT_EXPIRES_IN || '7d',
      },
    });
  } catch (error: any) {
    console.error('Error refreshing token:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Internal server error';
    return createErrorResponse(500, 'Failed to refresh token', errorMessage);
  }
};
