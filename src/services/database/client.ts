/**
 * Centralized DynamoDB Document Client instance
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { config } from '../../config';

// AWS clients
const dynamoClient = new DynamoDBClient({ region: config.awsRegion });
export const docClient = DynamoDBDocumentClient.from(dynamoClient);
