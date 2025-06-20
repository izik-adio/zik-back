import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { randomUUID } from 'crypto';
import { createSuccessResponse, createErrorResponse } from './utils/response';
import { validateGoalData } from './utils/validation';
import { withCognitoAuth } from './utils/cognitoAuth';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const GOALS_TABLE_NAME = process.env.GOALS_TABLE_NAME || '';

export const handler = withCognitoAuth(
  async (
    event: APIGatewayProxyEvent,
    cognitoUser
  ): Promise<APIGatewayProxyResult> => {
    try {
      if (!event.body) {
        return createErrorResponse(400, 'Missing request body');
      }

      // Check payload size
      if (event.body.length > 10000) {
        // 10KB limit
        return createErrorResponse(413, 'Payload too large');
      }

      let requestData;
      try {
        requestData = JSON.parse(event.body);
      } catch (parseError) {
        return createErrorResponse(400, 'Invalid JSON in request body');
      } // Validate the request data (without userId since it comes from JWT)
      const validation = validateGoalData(requestData, false); // Skip userId validation
      if (!validation.isValid) {
        return createErrorResponse(
          400,
          'Validation failed',
          validation.errors.join(', ')
        );
      } // Use userId from authenticated token
      const userId = cognitoUser.userId;
      const { goalName, description, targetDate, category, status } =
        requestData;

      const goalId = randomUUID();
      const createdAt = new Date().toISOString();
      const updatedAt = new Date().toISOString();
      const goalItem = {
        goalId,
        userId,
        goalName,
        description,
        targetDate,
        category,
        status: (status || 'active').toLowerCase(), // Normalize to lowercase
        createdAt,
        updatedAt,
      };
      const command = new PutCommand({
        TableName: GOALS_TABLE_NAME,
        Item: goalItem,
      });

      await docClient.send(command);

      return createSuccessResponse(201, goalItem);
    } catch (error) {
      console.error('Error creating goal:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Internal server error';
      return createErrorResponse(500, 'Failed to create goal', errorMessage);
    }
  }
);
