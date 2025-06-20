import { DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { createSuccessResponse, createErrorResponse } from './utils/response';
import { withCognitoAuth } from './utils/cognitoAuth';

const client = new DynamoDBClient({});
const GOALS_TABLE_NAME = process.env.GOALS_TABLE_NAME || '';
const USER_ID_INDEX = process.env.USER_ID_INDEX || 'userId-index'; // Assuming a GSI on userId for goals

export const handler = withCognitoAuth(
  async (
    event: APIGatewayProxyEvent,
    cognitoUser
  ): Promise<APIGatewayProxyResult> => {
    try {
      // Use userId from authenticated token
      const userId = cognitoUser.userId;

      const command = new QueryCommand({
        TableName: GOALS_TABLE_NAME,
        IndexName: USER_ID_INDEX,
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: {
          ':userId': { S: userId },
        },
      });
      const { Items } = await client.send(command);

      // Return empty array instead of 404 when no goals found
      const goals = Items ? Items.map((item) => unmarshall(item)) : [];

      return createSuccessResponse(200, goals);
    } catch (error) {
      console.error('Error fetching goals:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Internal server error';
      return createErrorResponse(500, 'Failed to fetch goals', errorMessage);
    }
  }
);
