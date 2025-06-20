import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  DeleteCommand,
  GetCommand,
} from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { createSuccessResponse, createErrorResponse } from './utils/response';
import { withCognitoAuth } from './utils/cognitoAuth';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
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

      // Use userId from authenticated token
      const userId = cognitoUser.userId; // First check if the task exists and verify ownership
      const getCommand = new GetCommand({
        TableName: TASKS_TABLE_NAME,
        Key: { taskId },
      });

      const { Item: existingItem } = await docClient.send(getCommand);

      if (!existingItem) {
        return createErrorResponse(404, 'Task not found');
      }
      const existingTask = existingItem;

      // Verify user ownership
      if (existingTask.userId !== userId) {
        return createErrorResponse(404, 'Task not found'); // Don't reveal existence to other users
      }

      const command = new DeleteCommand({
        TableName: TASKS_TABLE_NAME,
        Key: { taskId },
        ReturnValues: 'ALL_OLD', // Optional: to confirm what was deleted
      });

      const { Attributes } = await docClient.send(command);

      if (!Attributes) {
        return createErrorResponse(404, 'Task not found or already deleted');
      }

      return createSuccessResponse(200, {
        message: 'Task deleted successfully',
      });
    } catch (error) {
      console.error('Error deleting task:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Internal server error';
      return createErrorResponse(500, 'Failed to delete task', errorMessage);
    }
  }
);
