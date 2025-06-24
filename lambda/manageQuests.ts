import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  QueryCommandInput,
  DeleteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { randomUUID } from 'crypto';
import { CognitoJwtVerifier } from 'aws-jwt-verify';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const GOALS_TABLE_NAME = process.env.GOALS_TABLE_NAME || '';
const TASKS_TABLE_NAME = process.env.TASKS_TABLE_NAME || '';
const CHAT_MESSAGES_TABLE_NAME = process.env.CHAT_MESSAGES_TABLE_NAME || '';
const USER_ID_DUE_DATE_INDEX = process.env.USER_ID_DUE_DATE_INDEX || '';
const USER_POOL_ID = process.env.USER_POOL_ID || '';
const USER_POOL_CLIENT_ID = process.env.USER_POOL_CLIENT_ID || '';

// Create Cognito JWT verifier
const verifier = CognitoJwtVerifier.create({
  userPoolId: USER_POOL_ID,
  tokenUse: 'access',
  clientId: USER_POOL_CLIENT_ID,
});

interface CreateQuestRequest {
  title: string;
  dueDate: string;
  type: 'goal' | 'task';
  description?: string;
  priority?: string;
  category?: string;
}

interface UpdateQuestRequest {
  title?: string;
  dueDate?: string;
  description?: string;
  priority?: string;
  category?: string;
  status?: string;
  goalId?: string; // For linking tasks to goals
}

// Helper functions to handle both REST API and HTTP API v2 event formats
const getHttpMethod = (event: any): string => {
  return event.httpMethod || event.requestContext?.http?.method;
};

const getQueryParameters = (event: any): { [key: string]: string } | null => {
  return event.queryStringParameters || event.queryStringParameters;
};

const getPathParameters = (event: any): { [key: string]: string } | null => {
  return event.pathParameters || event.pathParameters;
};

const getRequestBody = (event: any): string | null => {
  return event.body;
};

const getAuthorizationHeader = (event: any): string | undefined => {
  const headers = event.headers || {};
  return headers.Authorization || headers.authorization;
};

// Helper function to create success response
const createSuccessResponse = (
  statusCode: number,
  data: any
): APIGatewayProxyResult => {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers':
        'Content-Type,X-Amz-Date,Authorization,X-Api-Key',
      'Access-Control-Allow-Methods': 'OPTIONS,GET,POST,PUT,DELETE',
    },
    body: JSON.stringify(data),
  };
};

// Helper function to create error response
const createErrorResponse = (
  statusCode: number,
  message: string,
  details?: string
): APIGatewayProxyResult => {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers':
        'Content-Type,X-Amz-Date,Authorization,X-Api-Key',
      'Access-Control-Allow-Methods': 'OPTIONS,GET,POST,PUT,DELETE',
    },
    body: JSON.stringify({
      error: message,
      details: details || undefined,
    }),
  };
};

// Extract user ID from Cognito JWT token
const getUserIdFromToken = async (event: any): Promise<string> => {
  const authHeader = getAuthorizationHeader(event);
  if (!authHeader) {
    throw new Error('Authorization header missing');
  }

  const token = authHeader.replace('Bearer ', '');
  try {
    const payload = await verifier.verify(token);
    return payload.sub; // Cognito 'sub' claim is the user ID
  } catch (error) {
    console.error('Token verification failed:', error);
    throw new Error('Invalid or expired token');
  }
};

// Handle POST requests - Create new quest (goal or task)
const handleCreateQuest = async (
  event: any
): Promise<APIGatewayProxyResult> => {
  try {
    const requestBody = getRequestBody(event);
    if (!requestBody) {
      return createErrorResponse(400, 'Missing request body');
    }

    // Get user ID from Cognito token
    const userId = await getUserIdFromToken(event);

    let requestData: CreateQuestRequest;
    try {
      requestData = JSON.parse(requestBody);
    } catch (parseError) {
      return createErrorResponse(400, 'Invalid JSON in request body');
    }

    const { title, dueDate, type, description, priority, category } =
      requestData;

    // Basic validation
    if (!title || !dueDate || !type) {
      return createErrorResponse(
        400,
        'Missing required fields: title, dueDate, type'
      );
    }

    if (type !== 'goal' && type !== 'task') {
      return createErrorResponse(400, 'Type must be either "goal" or "task"');
    }

    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(dueDate)) {
      return createErrorResponse(
        400,
        'Invalid date format. Expected YYYY-MM-DD'
      );
    }

    const now = new Date().toISOString();
    const itemId = randomUUID();

    if (type === 'goal') {
      // Create goal
      const goalItem = {
        userId,
        goalId: itemId,
        goalName: title,
        description: description || '',
        targetDate: dueDate,
        category: category || 'general',
        status: 'active', // Default status for new goals
        createdAt: now,
        updatedAt: now,
      };

      const command = new PutCommand({
        TableName: GOALS_TABLE_NAME,
        Item: goalItem,
      });

      await docClient.send(command);
      return createSuccessResponse(201, goalItem);
    } else {
      // Create task
      const taskItem = {
        userId,
        taskId: itemId,
        taskName: title,
        description: description || '',
        dueDate,
        priority: priority || 'medium',
        status: 'pending', // Default status for new tasks
        goalId: '', // Can be linked to a goal later via PUT update
        createdAt: now,
        updatedAt: now,
      };

      const command = new PutCommand({
        TableName: TASKS_TABLE_NAME,
        Item: taskItem,
      });

      await docClient.send(command);
      return createSuccessResponse(201, taskItem);
    }
  } catch (error) {
    console.error('Error creating quest:', error);
    if (error instanceof Error && error.message.includes('token')) {
      return createErrorResponse(401, 'Authentication failed', error.message);
    }
    const errorMessage =
      error instanceof Error ? error.message : 'Internal server error';
    return createErrorResponse(500, 'Failed to create quest', errorMessage);
  }
};

// Handle GET requests - Retrieve tasks by date
const handleGetQuests = async (event: any): Promise<APIGatewayProxyResult> => {
  try {
    // Get user ID from Cognito token
    const userId = await getUserIdFromToken(event);

    // Get date from query string parameters
    const queryParams = getQueryParameters(event);
    // Default to today's date if not provided, in YYYY-MM-DD format
    const date = queryParams?.date || new Date().toISOString().split('T')[0];

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      return createErrorResponse(
        400,
        'Invalid date format. Expected YYYY-MM-DD'
      );
    }

    // 1. Fetch all active Epic Quests (Goals)
    const goalsQuery: QueryCommandInput = {
      TableName: GOALS_TABLE_NAME,
      KeyConditionExpression: 'userId = :userId',
      FilterExpression: '#status = :active',
      ExpressionAttributeNames: {
        '#status': 'status',
      },
      ExpressionAttributeValues: {
        ':userId': userId,
        ':active': 'active',
      },
    };
    const goalsCommand = new QueryCommand(goalsQuery);
    const { Items: epicQuests } = await docClient.send(goalsCommand);

    // 2. Fetch Daily Quests for the specified date
    const tasksQuery: QueryCommandInput = {
      TableName: TASKS_TABLE_NAME,
      IndexName: USER_ID_DUE_DATE_INDEX,
      KeyConditionExpression: 'userId = :userId AND dueDate = :dueDate',
      ExpressionAttributeValues: {
        ':userId': userId,
        ':dueDate': date,
      },
    };

    const tasksCommand = new QueryCommand(tasksQuery);
    const { Items: dailyQuests } = await docClient.send(tasksCommand);

    // 3. Combine into the final response object
    const response = {
      epicQuests: epicQuests || [],
      dailyQuests: dailyQuests || [],
    };

    return createSuccessResponse(200, response);
  } catch (error) {
    console.error('Error retrieving quests:', error);
    if (error instanceof Error && error.message.includes('token')) {
      return createErrorResponse(401, 'Authentication failed', error.message);
    }
    const errorMessage =
      error instanceof Error ? error.message : 'Internal server error';
    return createErrorResponse(500, 'Failed to retrieve quests', errorMessage);
  }
};

// Handle DELETE requests - Delete quest (goal or task)
const handleDeleteQuest = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    // Get user ID from Cognito token
    const userId = await getUserIdFromToken(event);

    // Get quest ID and type from path parameters
    const questId = event.pathParameters?.questId;
    const questType = event.queryStringParameters?.type;

    if (!questId) {
      return createErrorResponse(400, 'Missing quest ID in path parameters');
    }

    if (!questType || (questType !== 'goal' && questType !== 'task')) {
      return createErrorResponse(
        400,
        'Missing or invalid type query parameter. Must be "goal" or "task"'
      );
    }

    let tableName: string;
    let keyName: string;

    if (questType === 'goal') {
      tableName = GOALS_TABLE_NAME;
      keyName = 'goalId';
    } else {
      tableName = TASKS_TABLE_NAME;
      keyName = 'taskId';
    }

    // Delete the quest
    const command = new DeleteCommand({
      TableName: tableName,
      Key: {
        userId,
        [keyName]: questId,
      },
      // Ensure the item exists before deleting
      ConditionExpression: 'attribute_exists(userId)',
    });

    try {
      await docClient.send(command);
      return createSuccessResponse(200, {
        message: `${questType} deleted successfully`,
        questId,
        questType,
      });
    } catch (deleteError: any) {
      if (deleteError.name === 'ConditionalCheckFailedException') {
        return createErrorResponse(404, `${questType} not found`);
      }
      throw deleteError;
    }
  } catch (error) {
    console.error('Error deleting quest:', error);
    if (error instanceof Error && error.message.includes('token')) {
      return createErrorResponse(401, 'Authentication failed', error.message);
    }
    const errorMessage =
      error instanceof Error ? error.message : 'Internal server error';
    return createErrorResponse(500, 'Failed to delete quest', errorMessage);
  }
};

// Handle PUT requests - Update quest (goal or task)
const handleUpdateQuest = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    // Get user ID from Cognito token
    const userId = await getUserIdFromToken(event);

    if (!event.body) {
      return createErrorResponse(400, 'Missing request body');
    }

    // Get quest ID and type from path parameters and query parameters
    const questId = event.pathParameters?.questId;
    const questType = event.queryStringParameters?.type;

    if (!questId) {
      return createErrorResponse(400, 'Missing quest ID in path parameters');
    }

    if (!questType || (questType !== 'goal' && questType !== 'task')) {
      return createErrorResponse(
        400,
        'Missing or invalid type query parameter. Must be "goal" or "task"'
      );
    }

    let requestData: UpdateQuestRequest;
    try {
      requestData = JSON.parse(event.body);
    } catch (parseError) {
      return createErrorResponse(400, 'Invalid JSON in request body');
    }

    const { title, dueDate, description, priority, category, status, goalId } =
      requestData;

    // Validate date format if provided
    if (dueDate) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(dueDate)) {
        return createErrorResponse(
          400,
          'Invalid date format. Expected YYYY-MM-DD'
        );
      }
    }

    // Validate status values
    if (status) {
      const validGoalStatuses = ['active', 'completed', 'paused'];
      const validTaskStatuses = ['pending', 'in-progress', 'completed'];

      if (questType === 'goal' && !validGoalStatuses.includes(status)) {
        return createErrorResponse(
          400,
          'Invalid status for goal. Must be: active, completed, or paused'
        );
      }

      if (questType === 'task' && !validTaskStatuses.includes(status)) {
        return createErrorResponse(
          400,
          'Invalid status for task. Must be: pending, in-progress, or completed'
        );
      }
    }

    const now = new Date().toISOString();
    let tableName: string;
    let keyName: string;
    let updateExpression = 'SET updatedAt = :updatedAt';
    let expressionAttributeValues: any = {
      ':updatedAt': now,
    };
    let expressionAttributeNames: any = {};

    if (questType === 'goal') {
      tableName = GOALS_TABLE_NAME;
      keyName = 'goalId';

      if (title) {
        updateExpression += ', goalName = :goalName';
        expressionAttributeValues[':goalName'] = title;
      }
      if (dueDate) {
        updateExpression += ', targetDate = :targetDate';
        expressionAttributeValues[':targetDate'] = dueDate;
      }
    } else {
      tableName = TASKS_TABLE_NAME;
      keyName = 'taskId';

      if (title) {
        updateExpression += ', taskName = :taskName';
        expressionAttributeValues[':taskName'] = title;
      }
      if (dueDate) {
        updateExpression += ', dueDate = :dueDate';
        expressionAttributeValues[':dueDate'] = dueDate;
      }
      if (priority) {
        updateExpression += ', priority = :priority';
        expressionAttributeValues[':priority'] = priority;
      }
      if (goalId) {
        updateExpression += ', goalId = :goalId';
        expressionAttributeValues[':goalId'] = goalId;
      }
    }

    // Common fields for both goals and tasks
    if (description !== undefined) {
      updateExpression += ', description = :description';
      expressionAttributeValues[':description'] = description;
    }
    if (category) {
      updateExpression += ', category = :category';
      expressionAttributeValues[':category'] = category;
    }
    if (status) {
      updateExpression += ', #status = :status';
      expressionAttributeValues[':status'] = status;
      expressionAttributeNames['#status'] = 'status';
    }

    // Update the quest
    const command = new UpdateCommand({
      TableName: tableName,
      Key: {
        userId,
        [keyName]: questId,
      },
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      ...(Object.keys(expressionAttributeNames).length > 0 && {
        ExpressionAttributeNames: expressionAttributeNames,
      }),
      // Ensure the item exists before updating
      ConditionExpression: 'attribute_exists(userId)',
      ReturnValues: 'ALL_NEW',
    });

    try {
      const result = await docClient.send(command);
      return createSuccessResponse(200, {
        message: `${questType} updated successfully`,
        quest: result.Attributes,
      });
    } catch (updateError: any) {
      if (updateError.name === 'ConditionalCheckFailedException') {
        return createErrorResponse(404, `${questType} not found`);
      }
      throw updateError;
    }
  } catch (error) {
    console.error('Error updating quest:', error);
    if (error instanceof Error && error.message.includes('token')) {
      return createErrorResponse(401, 'Authentication failed', error.message);
    }
    const errorMessage =
      error instanceof Error ? error.message : 'Internal server error';
    return createErrorResponse(500, 'Failed to update quest', errorMessage);
  }
};

/**
 * Main Lambda handler function for quest management operations
 *
 * This handler provides CRUD operations for Epic Quests (goals) and Daily Quests (tasks).
 * It supports both REST API and HTTP API v2 event formats from API Gateway.
 *
 * Supported operations:
 * - POST /quests - Create new quest (goal or task)
 * - GET /quests - Retrieve tasks by date
 * - PUT /quests/{questId} - Update existing quest
 * - DELETE /quests/{questId} - Delete quest
 *
 * All operations require valid Cognito JWT authentication and enforce user isolation.
 *
 * @param event - API Gateway proxy event (supports both REST API and HTTP API v2 formats)
 * @returns Promise<APIGatewayProxyResult> - Standardized HTTP response with CORS headers
 */
export const handler = async (
  event: APIGatewayProxyEvent | any // Allow any to handle HTTP API v2 format
): Promise<APIGatewayProxyResult> => {
  console.log('Received event:', JSON.stringify(event, null, 2));

  try {
    // Handle both REST API and HTTP API v2 event formats
    const httpMethod = getHttpMethod(event);
    console.log('HTTP Method:', httpMethod);

    switch (httpMethod) {
      case 'POST':
        return await handleCreateQuest(event);
      case 'GET':
        return await handleGetQuests(event);
      case 'PUT':
        return await handleUpdateQuest(event);
      case 'DELETE':
        return await handleDeleteQuest(event);
      default:
        return createErrorResponse(405, `Method ${httpMethod} not allowed`);
    }
  } catch (error) {
    console.error('Unexpected error in handler:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Internal server error';
    return createErrorResponse(500, 'Internal server error', errorMessage);
  }
};
