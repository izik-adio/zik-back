import {
  DynamoDBClient,
  UpdateItemCommand,
  GetItemCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { createSuccessResponse, createErrorResponse } from './utils/response';
import { validateTaskUpdateData } from './utils/validation';
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

      if (!event.body) {
        return createErrorResponse(400, 'Missing request body');
      } // Use userId from authenticated token
      const authenticatedUserId = cognitoUser.userId;

      // First check if the task exists
      const getCommand = new GetItemCommand({
        TableName: TASKS_TABLE_NAME,
        Key: marshall({ taskId }, { removeUndefinedValues: true }),
      });

      const { Item: existingItem } = await client.send(getCommand);
      if (!existingItem) {
        return createErrorResponse(404, 'Task not found');
      }

      const existingTask = unmarshall(existingItem);

      // Verify user ownership immediately
      if (existingTask.userId !== authenticatedUserId) {
        return createErrorResponse(404, 'Task not found'); // Don't reveal existence to other users
      }

      const requestData = JSON.parse(event.body);

      // Validate the request data
      const validation = validateTaskUpdateData(requestData);
      if (!validation.isValid) {
        return createErrorResponse(
          400,
          'Validation failed',
          validation.errors.join(', ')
        );
      }

      const { taskName, description, dueDate, priority, status } = requestData;
      // Note: We don't extract userId from requestData anymore since it comes from auth
      let updateExpression = 'SET';
      const expressionAttributeValues: Record<string, any> = {};
      const expressionAttributeNames: Record<string, string> = {};
      const updateParts: string[] = [];

      if (taskName !== undefined) {
        updateParts.push('#tn = :tn');
        expressionAttributeValues[':tn'] = taskName;
        expressionAttributeNames['#tn'] = 'taskName';
      }
      if (description !== undefined) {
        updateParts.push('description = :d');
        expressionAttributeValues[':d'] = description;
      }
      if (dueDate !== undefined) {
        updateParts.push('dueDate = :dd');
        expressionAttributeValues[':dd'] = dueDate;
      }
      if (priority !== undefined) {
        updateParts.push('priority = :p');
        expressionAttributeValues[':p'] = priority;
      }
      if (status !== undefined) {
        updateParts.push('#s = :s');
        expressionAttributeValues[':s'] = status;
        expressionAttributeNames['#s'] = 'status';
      }

      if (updateParts.length === 0) {
        return createErrorResponse(400, 'No fields to update provided');
      }

      // Always update the updatedAt field
      updateParts.push('updatedAt = :ua');
      expressionAttributeValues[':ua'] = new Date().toISOString();

      updateExpression += ' ' + updateParts.join(', ');
      const command = new UpdateItemCommand({
        TableName: TASKS_TABLE_NAME,
        Key: marshall({ taskId }, { removeUndefinedValues: true }),
        UpdateExpression: updateExpression,
        ExpressionAttributeValues: marshall(expressionAttributeValues, {
          removeUndefinedValues: true,
        }),
        ExpressionAttributeNames:
          Object.keys(expressionAttributeNames).length > 0
            ? expressionAttributeNames
            : undefined,
        ReturnValues: 'ALL_NEW',
      });

      const { Attributes } = await client.send(command);

      if (!Attributes) {
        return createErrorResponse(404, 'Task not found or update failed');
      }
      return createSuccessResponse(200, unmarshall(Attributes));
    } catch (error) {
      console.error('Error updating task:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Internal server error';
      return createErrorResponse(500, 'Failed to update task', errorMessage);
    }
  }
);
