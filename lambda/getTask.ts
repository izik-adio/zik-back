import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { createSuccessResponse, createErrorResponse } from './utils/response';
import { withCognitoAuth } from './utils/cognitoAuth';

const client = new DynamoDBClient({});
const TASKS_TABLE_NAME = process.env.TASKS_TABLE_NAME || '';

export const handler = withCognitoAuth(
  async (
    event: APIGatewayProxyEvent,
    cognitoUser
  ): Promise<APIGatewayProxyResult> => {
    try {
      const taskId = event.pathParameters?.taskId;

      if (!taskId) {
        return createErrorResponse(400, 'Missing taskId in path parameters');
      }

      // userId comes from authenticated token, not query parameters
      const userId = cognitoUser.userId;

      const command = new GetItemCommand({
        TableName: TASKS_TABLE_NAME,
        Key: {
          taskId: { S: taskId },
        },
      });

      const { Item } = await client.send(command);

      if (!Item) {
        return createErrorResponse(404, 'Task not found');
      }

      const task = unmarshall(Item);

      // Verify user ownership
      if (task.userId !== userId) {
        return createErrorResponse(404, 'Task not found'); // Don't reveal existence to other users
      }

      return createSuccessResponse(200, task);
    } catch (error) {
      console.error('Error fetching task:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Internal server error';
      return createErrorResponse(500, 'Failed to fetch task', errorMessage);
    }
  }
);
