import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { v4 as uuidv4 } from 'uuid';
import { createSuccessResponse, createErrorResponse } from './utils/response';
import { getUserByEmail, setPasswordResetToken } from './utils/userDb';
import { checkAuthRateLimit } from './utils/auth'; // For rate limiting

const sesClient = new SESClient({});

interface ForgotPasswordRequest {
  email: string;
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const DYNAMODB_TABLE_NAME = process.env.USERS_TABLE_NAME;
  const EMAIL_FROM_ADDRESS = process.env.EMAIL_FROM_ADDRESS;
  const API_GATEWAY_URL = process.env.API_GATEWAY_URL; // For constructing the reset link
  const PASSWORD_RESET_TOKEN_EXPIRES_IN_MINUTES = parseInt(
    process.env.PASSWORD_RESET_TOKEN_EXPIRES_IN_MINUTES || '60',
    10
  );

  if (!DYNAMODB_TABLE_NAME || !EMAIL_FROM_ADDRESS || !API_GATEWAY_URL) {
    console.error(
      'Missing environment variables: USERS_TABLE_NAME, EMAIL_FROM_ADDRESS, or API_GATEWAY_URL'
    );
    return createErrorResponse(
      500,
      'Internal server error: Configuration missing'
    );
  }

  try {
    if (!event.body) {
      return createErrorResponse(400, 'Missing request body');
    }

    let requestData: ForgotPasswordRequest;
    try {
      requestData = JSON.parse(event.body);
    } catch (parseError) {
      return createErrorResponse(400, 'Invalid JSON in request body');
    }

    const { email } = requestData;

    if (!email) {
      return createErrorResponse(400, 'Email is required');
    }

    // Rate limiting by IP (similar to login/register)
    const clientIp =
      event.requestContext?.identity?.sourceIp ||
      event.headers?.['x-forwarded-for'] ||
      'unknown';
    if (!checkAuthRateLimit(clientIp, 10, 600000)) {
      // 10 attempts per 10 minutes per IP
      return createErrorResponse(
        429,
        'Too many password reset requests. Please try again later.'
      );
    }

    // Rate limiting by email
    if (!checkAuthRateLimit(email, 5, 900000)) {
      // 5 attempts per 15 minutes per email
      return createErrorResponse(
        429,
        'Too many password reset requests for this email. Please try again later.'
      );
    }

    const user = await getUserByEmail(email);

    if (!user) {
      // Important: Do not reveal if the email exists or not for security reasons.
      // Send a generic success response even if the user is not found.
      console.warn(`Password reset attempt for non-existent email: ${email}`);
      return createSuccessResponse(200, {
        message:
          'If your email address is in our database, you will receive a password reset link shortly.',
      });
    }

    if (!user.isEmailVerified) {
      console.warn(`Password reset attempt for unverified email: ${email}`);
      return createSuccessResponse(200, {
        // Still generic for security
        message:
          'If your email address is in our database and verified, you will receive a password reset link shortly.',
      });
    }

    const resetToken = uuidv4();
    const expiresAt = new Date(
      Date.now() + PASSWORD_RESET_TOKEN_EXPIRES_IN_MINUTES * 60 * 1000
    );

    await setPasswordResetToken(user.userId, resetToken, expiresAt);

    const resetLink = `${API_GATEWAY_URL}/reset-password?token=${resetToken}&email=${encodeURIComponent(
      email
    )}`;
    // Ensure your API Gateway has a GET route for /reset-password that ideally serves a frontend page,
    // or the link could point directly to a frontend URL that then calls the resetPassword API.

    const sendEmailParams = {
      Source: EMAIL_FROM_ADDRESS,
      Destination: { ToAddresses: [email] },
      Message: {
        Subject: { Data: 'Your Password Reset Request for Zik' },
        Body: {
          Html: {
            Data: `<p>Hello ${user.userName || 'user'},</p>
                   <p>You requested a password reset. Click the link below to reset your password:</p>
                   <a href="${resetLink}">${resetLink}</a>
                   <p>This link will expire in ${PASSWORD_RESET_TOKEN_EXPIRES_IN_MINUTES} minutes.</p>
                   <p>If you did not request this, please ignore this email.</p>
                   <p>Thanks,<br>The Zik Team</p>`,
          },
          Text: {
            Data: `Hello ${user.userName || 'user'},

You requested a password reset. Copy and paste the following link into your browser to reset your password:
${resetLink}

This link will expire in ${PASSWORD_RESET_TOKEN_EXPIRES_IN_MINUTES} minutes.

If you did not request this, please ignore this email.

Thanks,
The Zik Team`,
          },
        },
      },
    };

    try {
      await sesClient.send(new SendEmailCommand(sendEmailParams));
    } catch (emailError) {
      console.error('Failed to send password reset email:', emailError);
      // Do not expose email sending failure to the user directly.
      // Log it and consider a retry mechanism or monitoring.
      // The user still gets the generic success message.
    }

    return createSuccessResponse(200, {
      message:
        'If your email address is in our database and verified, you will receive a password reset link shortly.',
    });
  } catch (error: any) {
    console.error('Error in forgotPassword handler:', error);
    // Generic error for the client
    return createErrorResponse(
      500,
      'An error occurred while processing your request.'
    );
  }
};
