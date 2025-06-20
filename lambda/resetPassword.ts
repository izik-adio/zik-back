import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  getUserByPasswordResetToken,
  updateUserPassword,
  clearPasswordResetToken,
} from './utils/userDb';
import { hashPassword, verifyPasswordComplexity } from './utils/auth';
import { createErrorResponse, createSuccessResponse } from './utils/response';

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  if (!event.body) {
    return createErrorResponse(400, 'Missing request body');
  }

  try {
    const { token, newPassword } = JSON.parse(event.body);

    if (!token) {
      return createErrorResponse(400, 'Reset token is required');
    }
    if (!newPassword) {
      return createErrorResponse(400, 'New password is required');
    }

    // Verify password complexity (e.g., minimum length)
    if (!verifyPasswordComplexity(newPassword)) {
      return createErrorResponse(
        400,
        'Password does not meet complexity requirements. It must be at least 8 characters long.'
      );
    }

    const user = await getUserByPasswordResetToken(token);

    if (!user) {
      return createErrorResponse(400, 'Invalid or expired reset token.');
    }

    // Check if token has expired (redundant if getUserByPasswordResetToken already checks expiry, but good for defense in depth)
    if (
      user.passwordResetTokenExpiresAt &&
      new Date(user.passwordResetTokenExpiresAt) < new Date()
    ) {
      await clearPasswordResetToken(user.userId); // Clear expired token
      return createErrorResponse(400, 'Reset token has expired.');
    }

    const hashedPassword = await hashPassword(newPassword);
    await updateUserPassword(user.userId, hashedPassword);
    await clearPasswordResetToken(user.userId);

    return createSuccessResponse(200, {
      message: 'Password has been reset successfully.',
    });
  } catch (error: any) {
    console.error('Error resetting password:', error);
    if (
      error.message === 'Invalid or expired reset token.' ||
      error.message === 'Reset token has expired.'
    ) {
      return createErrorResponse(400, error.message);
    }
    return createErrorResponse(500, 'Error resetting password', error.message);
  }
};
