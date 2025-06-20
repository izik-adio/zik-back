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
const GOALS_TABLE_NAME = process.env.GOALS_TABLE_NAME || '';

export const handler = withCognitoAuth(
  async (
    event: APIGatewayProxyEvent,
    cognitoUser
  ): Promise<APIGatewayProxyResult> => {
    try {
      const goalId = event.pathParameters?.goalId;

      if (!goalId) {
        return createErrorResponse(400, 'Missing goalId in path parameters');
      }

      // Use userId from authenticated token
      const userId = cognitoUser.userId; // First check if the goal exists and verify ownership
      const getCommand = new GetCommand({
        TableName: GOALS_TABLE_NAME,
        Key: { goalId },
      });

      const { Item: existingItem } = await docClient.send(getCommand);

      if (!existingItem) {
        return createErrorResponse(404, 'Goal not found');
      }
      const existingGoal = existingItem;

      // Verify user ownership
      if (existingGoal.userId !== userId) {
        return createErrorResponse(404, 'Goal not found'); // Don't reveal existence to other users
      }

      const command = new DeleteCommand({
        TableName: GOALS_TABLE_NAME,
        Key: { goalId },
        ReturnValues: 'ALL_OLD', // Optional: to confirm what was deleted
      });

      const { Attributes } = await docClient.send(command);

      if (!Attributes) {
        return createErrorResponse(404, 'Goal not found or already deleted');
      }

      return createSuccessResponse(200, {
        message: 'Goal deleted successfully',
      });
    } catch (error) {
      console.error('Error deleting goal:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Internal server error';
      return createErrorResponse(500, 'Failed to delete goal', errorMessage);
    }
  }
);
