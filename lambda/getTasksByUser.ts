import { DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { createSuccessResponse, createErrorResponse } from './utils/response';
import { withCognitoAuth } from './utils/cognitoAuth';

const client = new DynamoDBClient({});
const TASKS_TABLE_NAME = process.env.TASKS_TABLE_NAME || '';
const USER_ID_INDEX = process.env.USER_ID_INDEX || 'userId-tasks-index'; // Ensure this matches the GSI name in CDK

export const handler = withCognitoAuth(
  async (
    event: APIGatewayProxyEvent,
    cognitoUser
  ): Promise<APIGatewayProxyResult> => {
    try {
      // Use userId from authenticated token instead of path parameter
      const userId = cognitoUser.userId;

      const command = new QueryCommand({
        TableName: TASKS_TABLE_NAME,
        IndexName: USER_ID_INDEX,
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: {
          ':userId': { S: userId },
        },
      });

      const { Items } = await client.send(command);
      if (!Items || Items.length === 0) {
        return createSuccessResponse(200, []); // Return empty array instead of 404
      }

      const tasks = Items.map((item) => unmarshall(item));

      return createSuccessResponse(200, tasks);
    } catch (error) {
      console.error('Error fetching tasks by user:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Internal server error';
      return createErrorResponse(500, 'Failed to fetch tasks', errorMessage);
    }
  }
);
