import { DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { createSuccessResponse, createErrorResponse } from './utils/response';
import { withCognitoAuth } from './utils/cognitoAuth';

const client = new DynamoDBClient({});
const TASKS_TABLE_NAME = process.env.TASKS_TABLE_NAME || '';
const USER_ID_DUE_DATE_INDEX =
  process.env.USER_ID_DUE_DATE_INDEX || 'userId-dueDate-index';

export const handler = withCognitoAuth(
  async (
    event: APIGatewayProxyEvent,
    cognitoUser
  ): Promise<APIGatewayProxyResult> => {
    try {
      const dateValue = event.pathParameters?.dateValue;

      if (!dateValue) {
        return createErrorResponse(
          400,
          'Missing required path parameter: dateValue'
        );
      }

      // Use userId from authenticated token
      const userId = cognitoUser.userId;

      // Validate date format
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(dateValue)) {
        return createErrorResponse(
          400,
          'Invalid date format. Expected YYYY-MM-DD'
        );
      }

      const command = new QueryCommand({
        TableName: TASKS_TABLE_NAME,
        IndexName: USER_ID_DUE_DATE_INDEX,
        KeyConditionExpression: 'userId = :userId AND dueDate = :dueDate',
        ExpressionAttributeValues: {
          ':userId': { S: userId },
          ':dueDate': { S: dateValue },
        },
      });

      const { Items } = await client.send(command);

      // Return empty array instead of 404 when no tasks found
      const tasks = Items ? Items.map((item) => unmarshall(item)) : [];

      return createSuccessResponse(200, tasks);
    } catch (error) {
      console.error('Error fetching tasks by date:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Internal server error';
      return createErrorResponse(500, 'Failed to fetch tasks', errorMessage);
    }
  }
);
