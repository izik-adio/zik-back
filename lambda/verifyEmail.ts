import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

const ddbClient = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

export const handler = async (event: any): Promise<any> => {
  const DYNAMODB_TABLE_NAME = process.env.USERS_TABLE_NAME;

  if (!DYNAMODB_TABLE_NAME) {
    console.error('Missing environment variable: USERS_TABLE_NAME');
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Internal server error: Configuration missing',
      }),
      headers: { 'Content-Type': 'application/json' },
    };
  }

  try {
    // Token and email can be passed as query string parameters for a GET request
    const token = event.queryStringParameters?.token;
    const email = event.queryStringParameters?.email
      ? decodeURIComponent(event.queryStringParameters.email)
      : null;

    if (!token || !email) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: 'Missing verification token or email',
        }),
        headers: { 'Content-Type': 'application/json' },
      };
    }

    // Query using the GSI on verificationToken
    const queryCommand = new QueryCommand({
      TableName: DYNAMODB_TABLE_NAME,
      IndexName: 'VerificationTokenIndex', // Ensure this GSI exists
      KeyConditionExpression: 'verificationToken = :verificationToken',
      ExpressionAttributeValues: {
        ':verificationToken': token,
      },
    });

    const { Items } = await ddbDocClient.send(queryCommand);

    if (!Items || Items.length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: 'Invalid or expired verification token (token not found)',
        }),
        headers: { 'Content-Type': 'application/json' },
      };
    }

    // The query on GSI might return multiple items if tokens are not unique (though UUIDs should be).
    // We are interested in the one that also matches the email for added security.
    const user = Items.find((item) => item.email === email);

    if (!user) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: 'Invalid verification token or email mismatch',
        }),
        headers: { 'Content-Type': 'application/json' },
      };
    }

    if (user.isEmailVerified) {
      // Changed from isVerified to isEmailVerified
      return {
        statusCode: 200, // Or 400 if you want to indicate it's already done
        body: JSON.stringify({ message: 'Email already verified' }),
        headers: { 'Content-Type': 'application/json' },
      };
    }

    // Update user to set isEmailVerified to true and remove verificationToken
    const updateCommand = new UpdateCommand({
      TableName: DYNAMODB_TABLE_NAME,
      Key: {
        userId: user.userId, // Changed from email: user.email to userId: user.userId
      },
      UpdateExpression:
        'SET isEmailVerified = :isEmailVerified, updatedAt = :updatedAt REMOVE verificationToken', // Changed from isVerified to isEmailVerified
      ExpressionAttributeValues: {
        ':isEmailVerified': true, // Changed from isVerified to isEmailVerified
        ':updatedAt': new Date().toISOString(),
      },
      ReturnValues: 'UPDATED_NEW',
    });

    await ddbDocClient.send(updateCommand);

    // You might want to redirect the user to a success page or return a success message.
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Email verified successfully. You can now log in.',
      }),
      headers: {
        'Content-Type': 'application/json',
        // Consider a redirect header if you have a frontend page:
        // 'Location': 'https://yourapp.com/verification-success'
      },
    };
  } catch (error: any) {
    console.error('Error during email verification:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Internal server error',
        error: error.message,
      }),
      headers: { 'Content-Type': 'application/json' },
    };
  }
};
