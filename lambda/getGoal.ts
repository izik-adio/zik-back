import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
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
      const userId = cognitoUser.userId;
      const command = new GetCommand({
        TableName: GOALS_TABLE_NAME,
        Key: {
          goalId: goalId,
        },
      });

      const { Item } = await docClient.send(command);

      if (!Item) {
        return createErrorResponse(404, 'Goal not found');
      }

      const goal = Item;

      // Verify user ownership
      if (goal.userId !== userId) {
        return createErrorResponse(404, 'Goal not found'); // Don't reveal existence to other users
      }

      return createSuccessResponse(200, goal);
    } catch (error) {
      console.error('Error fetching goal:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Internal server error';
      return createErrorResponse(500, 'Failed to fetch goal', errorMessage);
    }
  }
);
