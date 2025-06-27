/**
 * HTTP response helper functions for API Gateway
 */
import { APIGatewayProxyResult } from 'aws-lambda';

/**
 * Creates a standardized API response
 * @param statusCode - HTTP status code
 * @param body - Response body object
 * @returns APIGatewayProxyResult
 */
export function createResponse(
  statusCode: number,
  body: any
): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers':
        'Content-Type,X-Amz-Date,Authorization,X-Api-Key',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS', // Added GET and others
    },
    body: JSON.stringify(body),
  };
}

/**
 * Creates a success response
 * @param data - Response data
 * @param requestId - Request identifier
 * @returns APIGatewayProxyResult
 */
export function createSuccessResponse(
  data: any,
  requestId?: string
): APIGatewayProxyResult {
  return createResponse(200, {
    ...data,
    timestamp: new Date().toISOString(),
    ...(requestId && { requestId }),
  });
}

/**
 * Creates an error response
 * @param statusCode - HTTP status code
 * @param message - Error message
 * @param requestId - Request identifier
 * @returns APIGatewayProxyResult
 */
export function createErrorResponse(
  statusCode: number,
  message: string,
  requestId?: string
): APIGatewayProxyResult {
  return createResponse(statusCode, {
    error: message,
    timestamp: new Date().toISOString(),
    ...(requestId && { requestId }),
  });
}
