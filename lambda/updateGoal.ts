import {
  DynamoDBClient,
  UpdateItemCommand,
  GetItemCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { createSuccessResponse, createErrorResponse } from './utils/response';
import { validateGoalUpdateData } from './utils/validation';
import { withCognitoAuth } from './utils/cognitoAuth';

const client = new DynamoDBClient({});
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

      if (!event.body) {
        return createErrorResponse(400, 'Missing request body');
      } // First check if the goal exists
      const getCommand = new GetItemCommand({
        TableName: GOALS_TABLE_NAME,
        Key: marshall({ goalId }, { removeUndefinedValues: true }),
      });

      const { Item: existingItem } = await client.send(getCommand);

      if (!existingItem) {
        return createErrorResponse(404, 'Goal not found');
      }
      const existingGoal = unmarshall(existingItem);
      const requestData = JSON.parse(event.body); // Validate the request data (without userId since it comes from JWT)
      const validation = validateGoalUpdateData(requestData);
      if (!validation.isValid) {
        return createErrorResponse(
          400,
          'Validation failed',
          validation.errors.join(', ')
        );
      }

      // Use userId from authenticated token
      const authenticatedUserId = cognitoUser.userId;
      const { goalName, description, targetDate, category, status } =
        requestData;

      // Verify user ownership
      if (existingGoal.userId !== authenticatedUserId) {
        return createErrorResponse(404, 'Goal not found'); // Don't reveal existence to other users
      }
      let updateExpression = 'SET';
      const expressionAttributeValues: Record<string, any> = {};
      const expressionAttributeNames: Record<string, string> = {};
      const updateParts: string[] = [];

      if (goalName !== undefined) {
        updateParts.push('#gn = :gn');
        expressionAttributeValues[':gn'] = goalName;
        expressionAttributeNames['#gn'] = 'goalName';
      }
      if (description !== undefined) {
        updateParts.push('description = :d');
        expressionAttributeValues[':d'] = description;
      }
      if (targetDate !== undefined) {
        updateParts.push('targetDate = :td');
        expressionAttributeValues[':td'] = targetDate;
      }
      if (category !== undefined) {
        updateParts.push('category = :c');
        expressionAttributeValues[':c'] = category;
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
        TableName: GOALS_TABLE_NAME,
        Key: marshall({ goalId }, { removeUndefinedValues: true }),
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
        return createErrorResponse(404, 'Goal not found or update failed');
      }

      return createSuccessResponse(200, unmarshall(Attributes));
    } catch (error) {
      console.error('Error updating goal:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Internal server error';
      return createErrorResponse(500, 'Failed to update goal', errorMessage);
    }
  }
);
