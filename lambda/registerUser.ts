import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { createSuccessResponse, createErrorResponse } from './utils/response';
import {
  generateToken,
  generateRefreshToken,
  hashPassword,
  checkAuthRateLimit,
} from './utils/auth';
import { createUser } from './utils/userDb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

const ddbClient = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);
const sesClient = new SESClient({});

interface RegisterRequest {
  email: string;
  password: string;
  userName: string;
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const DYNAMODB_TABLE_NAME = process.env.USERS_TABLE_NAME;
  const EMAIL_FROM_ADDRESS = process.env.EMAIL_FROM_ADDRESS; // Verified SES email
  const API_GATEWAY_URL = process.env.API_GATEWAY_URL; // You'll need to pass your API Gateway URL to construct the verification link

  if (!DYNAMODB_TABLE_NAME || !EMAIL_FROM_ADDRESS || !API_GATEWAY_URL) {
    console.error(
      'Missing environment variables: USERS_TABLE_NAME, EMAIL_FROM_ADDRESS, or API_GATEWAY_URL'
    );
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

    // Check payload size
    if (event.body.length > 5000) {
      return createErrorResponse(413, 'Payload too large');
    }

    let requestData: RegisterRequest;
    try {
      requestData = JSON.parse(event.body);
    } catch (parseError) {
      return createErrorResponse(400, 'Invalid JSON in request body');
    } // Rate limiting by IP
    const clientIp =
      event.requestContext?.identity?.sourceIp ||
      event.headers?.['x-forwarded-for'] ||
      'unknown';
    if (!checkAuthRateLimit(clientIp, 50, 300000)) {
      // 50 attempts per 5 minutes (increased for testing)
      return createErrorResponse(
        429,
        'Too many registration attempts. Please try again later.'
      );
    } // Validate required fields
    const { email, password, userName } = requestData;

    if (!email || !password || !userName) {
      return createErrorResponse(
        400,
        'Email, password, and userName are required'
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return createErrorResponse(400, 'Invalid email format');
    }

    // Validate password strength
    if (password.length < 8) {
      return createErrorResponse(
        400,
        'Password must be at least 8 characters long'
      );
    }

    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
      return createErrorResponse(
        400,
        'Password must contain at least one uppercase letter, one lowercase letter, and one number'
      );
    } // Validate userName
    if (userName.length < 2 || userName.length > 50) {
      return createErrorResponse(
        400,
        'User name must be between 2 and 50 characters'
      );
    }

    // Check if user already exists
    const queryCommand = new QueryCommand({
      TableName: DYNAMODB_TABLE_NAME,
      KeyConditionExpression: 'email = :email',
      ExpressionAttributeValues: {
        ':email': email,
      },
    });

    const { Items } = await ddbDocClient.send(queryCommand);
    if (Items && Items.length > 0) {
      return {
        statusCode: 409, // Conflict
        body: JSON.stringify({
          message: 'User with this email already exists',
        }),
        headers: { 'Content-Type': 'application/json' },
      };
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const verificationToken = uuidv4();
    const now = new Date().toISOString();

    // Auto-verify users in test environments
    const isTestEnv =
      process.env.NODE_ENV === 'test' ||
      process.env.RELAX_RATE_LIMITS === 'true';
    const isVerified = isTestEnv;
    const userItem = {
      userId: uuidv4(), // Add unique user ID
      email,
      userName: userName, // Use userName from request
      hashedPassword,
      isEmailVerified: isVerified, // Standardize to isEmailVerified
      verificationToken: isVerified ? 'auto-verified' : verificationToken, // Use dummy value for auto-verified users
      createdAt: now,
      updatedAt: now,
    };

    const putCommand = new PutCommand({
      TableName: DYNAMODB_TABLE_NAME,
      Item: userItem,
    });
    await ddbDocClient.send(putCommand); // Send verification email only if not in test environment
    if (
      !isTestEnv &&
      verificationToken &&
      verificationToken !== 'auto-verified'
    ) {
      // Send verification email
      const verificationLink = `${API_GATEWAY_URL}/verify-email?token=${verificationToken}&email=${encodeURIComponent(
        email
      )}`; // Ensure /verify-email is a GET route

      const sendEmailParams = {
        Source: EMAIL_FROM_ADDRESS,
        Destination: {
          ToAddresses: [email],
        },
        Message: {
          Subject: {
            Data: 'Verify Your Email for Zik',
          },
          Body: {
            Html: {
              Data: `<p>Hello ${userName},</p>
              <p>Thank you for registering with Zik. Please verify your email address by clicking the link below:</p>
              <a href="${verificationLink}">${verificationLink}</a>
              <p>If you did not request this, please ignore this email.</p>
              <p>Thanks,<br>The Zik Team</p>`,
            },
            Text: {
              Data: `Hello ${userName},

Thank you for registering with Zik. Please verify your email address by visiting the following link:
${verificationLink}

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
        console.error('Failed to send verification email:', emailError);
        // Decide if you want to roll back user creation or just log the error.
        // For now, we'll proceed but the user won't be able to verify.
        // You might want to add a mechanism to resend verification.
      }
    }

    const message = isTestEnv
      ? 'User registered successfully and auto-verified for testing.'
      : 'User registered successfully. Please check your email to verify your account.';

    return {
      statusCode: 201,
      body: JSON.stringify({
        message,
        // Do NOT return the token in the registration response for security.
      }),
      headers: { 'Content-Type': 'application/json' },
    };
  } catch (error: any) {
    console.error('Error registering user:', error);

    // Handle specific errors
    if (error.message === 'User with this email already exists') {
      return createErrorResponse(409, 'User with this email already exists');
    }

    const errorMessage =
      error instanceof Error ? error.message : 'Internal server error';
    return createErrorResponse(500, 'Failed to register user', errorMessage);
  }
};
