import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { randomUUID } from 'crypto';
import { createSuccessResponse, createErrorResponse } from './utils/response';
import { validateTaskData } from './utils/validation';
import { getCognitoUserFromEvent, withCognitoAuth } from './utils/cognitoAuth';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const TASKS_TABLE_NAME = process.env.TASKS_TABLE_NAME || '';

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
      } // Validate the request data - but don't require userId since we get it from auth
      const validationData = { ...requestData, userId: cognitoUser.userId };
      const validation = validateTaskData(validationData);
      if (!validation.isValid) {
        return createErrorResponse(
          400,
          'Validation failed',
          validation.errors.join(', ')
        );
      }

      const { taskName, description, dueDate, priority, status } = requestData;
      // Use userId from authenticated token, not from request body
      const userId = cognitoUser.userId;

      const taskId = randomUUID();
      const createdAt = new Date().toISOString();
      const updatedAt = new Date().toISOString();
      const taskItem = {
        taskId,
        userId,
        taskName,
        description,
        dueDate,
        priority: (priority || 'medium').toLowerCase(), // Normalize to lowercase
        status: (status || 'pending').toLowerCase(), // Normalize to lowercase
        createdAt,
        updatedAt,
      };
      const command = new PutCommand({
        TableName: TASKS_TABLE_NAME,
        Item: taskItem,
      });

      await docClient.send(command);

      return createSuccessResponse(201, taskItem);
    } catch (error) {
      console.error('Error creating task:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Internal server error';
      return createErrorResponse(500, 'Failed to create task', errorMessage);
    }
  }
);
