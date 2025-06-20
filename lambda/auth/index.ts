import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import * as jwt from 'jsonwebtoken';
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';

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

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult | any> => {
  try {
    const secret = await getJwtSecret();
    const token = event.headers?.Authorization?.split(' ')[1]; // Expecting "Bearer <token>"

    if (!token) {
      console.log('No token provided');
      return {
        statusCode: 401,
        body: JSON.stringify({ message: 'Unauthorized: No token provided' }),
      };
    }

    let decoded;
    try {
      decoded = jwt.verify(token, secret) as {
        userId: string;
        email: string;
        name: string;
        [key: string]: any;
      };
    } catch (err: any) {
      console.log('Invalid token:', err.message);
      return {
        statusCode: 401, // Or 403 if you prefer for invalid token
        body: JSON.stringify({
          message: `Unauthorized: Invalid token - ${err.message}`,
        }),
      };
    }

    // Token is valid, construct the policy for API Gateway
    // The principalId can be the user ID or any unique identifier for the user
    const principalId = decoded.userId || decoded.email;

    // You can pass context to the backend Lambda if needed
    const context = {
      userId: decoded.userId, // Or decoded.email
      email: decoded.email,
      name: decoded.name,
      // Add any other user-specific data you want to pass from the token
    };

    // Return a simple response for HttpLambdaAuthorizer with responseType: HttpLambdaResponseType.SIMPLE
    // If you were using HttpLambdaResponseType.IAM, you would return an IAM policy here.
    return {
      isAuthorized: true,
      context: context, // This context is passed to the integration Lambda
    };
  } catch (error: any) {
    console.error('Error in Lambda Authorizer or fetching secret:', error);
    return {
      statusCode: 500, // Internal server error
      body: JSON.stringify({
        message: 'Internal server error during authorization',
      }),
    };
  }
};
