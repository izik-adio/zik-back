/**
 * Unit tests for HTTP response utility functions
 * These are pure functions so no mocking is needed
 */
import {
  createResponse,
  createSuccessResponse,
  createErrorResponse,
} from '../responses';

describe('Response Utilities', () => {
  const mockTimestamp = '2025-06-23T10:00:00.000Z';

  beforeEach(() => {
    // Mock Date.prototype.toISOString to return consistent timestamp
    jest.spyOn(Date.prototype, 'toISOString').mockReturnValue(mockTimestamp);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('createResponse', () => {
    it('should create a properly formatted API Gateway response', () => {
      const statusCode = 200;
      const body = { message: 'Success', data: { id: 123 } };

      const response = createResponse(statusCode, body);

      expect(response).toEqual({
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers':
            'Content-Type,X-Amz-Date,Authorization,X-Api-Key',
          'Access-Control-Allow-Methods': 'POST,OPTIONS',
        },
        body: JSON.stringify(body),
      });
    });

    it('should handle different status codes', () => {
      const testCases = [
        { statusCode: 200, description: 'success' },
        { statusCode: 201, description: 'created' },
        { statusCode: 400, description: 'bad request' },
        { statusCode: 401, description: 'unauthorized' },
        { statusCode: 404, description: 'not found' },
        { statusCode: 500, description: 'internal server error' },
      ];

      testCases.forEach(({ statusCode, description }) => {
        const body = { message: description };
        const response = createResponse(statusCode, body);

        expect(response.statusCode).toBe(statusCode);
        expect(response.body).toBe(JSON.stringify(body));
      });
    });

    it('should handle different body types', () => {
      const testCases = [
        { body: { message: 'string message' }, description: 'object body' },
        { body: 'simple string', description: 'string body' },
        { body: [1, 2, 3], description: 'array body' },
        { body: null, description: 'null body' },
        {
          body: { nested: { data: { value: 42 } } },
          description: 'nested object',
        },
      ];

      testCases.forEach(({ body, description }) => {
        const response = createResponse(200, body);

        expect(response.body).toBe(JSON.stringify(body));
        expect(response.statusCode).toBe(200);
      });
    });

    it('should always include CORS headers', () => {
      const response = createResponse(200, {});

      expect(response.headers).toMatchObject({
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers':
          'Content-Type,X-Amz-Date,Authorization,X-Api-Key',
        'Access-Control-Allow-Methods': 'POST,OPTIONS',
      });
    });
  });

  describe('createSuccessResponse', () => {
    it('should create a 200 success response with timestamp', () => {
      const data = { message: 'Operation successful', result: { id: 123 } };

      const response = createSuccessResponse(data);

      expect(response).toEqual({
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers':
            'Content-Type,X-Amz-Date,Authorization,X-Api-Key',
          'Access-Control-Allow-Methods': 'POST,OPTIONS',
        },
        body: JSON.stringify({
          message: 'Operation successful',
          result: { id: 123 },
          timestamp: mockTimestamp,
        }),
      });
    });

    it('should include requestId when provided', () => {
      const data = { message: 'Success' };
      const requestId = 'req-123-456';

      const response = createSuccessResponse(data, requestId);

      const responseBody = JSON.parse(response.body);
      expect(responseBody).toMatchObject({
        message: 'Success',
        timestamp: mockTimestamp,
        requestId: requestId,
      });
    });

    it('should not include requestId when not provided', () => {
      const data = { message: 'Success' };

      const response = createSuccessResponse(data);

      const responseBody = JSON.parse(response.body);
      expect(responseBody).toEqual({
        message: 'Success',
        timestamp: mockTimestamp,
      });
      expect(responseBody.requestId).toBeUndefined();
    });

    it('should merge data properties with metadata', () => {
      const data = {
        message: 'Task created',
        task: {
          id: 'task-123',
          title: 'Test Task',
          status: 'pending',
        },
      };
      const requestId = 'req-789';

      const response = createSuccessResponse(data, requestId);

      const responseBody = JSON.parse(response.body);
      expect(responseBody).toEqual({
        message: 'Task created',
        task: {
          id: 'task-123',
          title: 'Test Task',
          status: 'pending',
        },
        timestamp: mockTimestamp,
        requestId: requestId,
      });
    });

    it('should handle empty data object', () => {
      const response = createSuccessResponse({});

      const responseBody = JSON.parse(response.body);
      expect(responseBody).toEqual({
        timestamp: mockTimestamp,
      });
    });
  });

  describe('createErrorResponse', () => {
    it('should create an error response with proper status code and message', () => {
      const statusCode = 400;
      const message = 'Invalid request format';

      const response = createErrorResponse(statusCode, message);

      expect(response).toEqual({
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers':
            'Content-Type,X-Amz-Date,Authorization,X-Api-Key',
          'Access-Control-Allow-Methods': 'POST,OPTIONS',
        },
        body: JSON.stringify({
          error: message,
          timestamp: mockTimestamp,
        }),
      });
    });

    it('should include requestId when provided', () => {
      const statusCode = 404;
      const message = 'Resource not found';
      const requestId = 'req-error-123';

      const response = createErrorResponse(statusCode, message, requestId);

      const responseBody = JSON.parse(response.body);
      expect(responseBody).toEqual({
        error: message,
        timestamp: mockTimestamp,
        requestId: requestId,
      });
    });

    it('should handle different error status codes', () => {
      const errorCases = [
        { statusCode: 400, message: 'Bad Request' },
        { statusCode: 401, message: 'Unauthorized' },
        { statusCode: 403, message: 'Forbidden' },
        { statusCode: 404, message: 'Not Found' },
        { statusCode: 409, message: 'Conflict' },
        { statusCode: 422, message: 'Unprocessable Entity' },
        { statusCode: 429, message: 'Too Many Requests' },
        { statusCode: 500, message: 'Internal Server Error' },
        { statusCode: 502, message: 'Bad Gateway' },
        { statusCode: 503, message: 'Service Unavailable' },
      ];

      errorCases.forEach(({ statusCode, message }) => {
        const response = createErrorResponse(statusCode, message);

        expect(response.statusCode).toBe(statusCode);
        const responseBody = JSON.parse(response.body);
        expect(responseBody.error).toBe(message);
      });
    });

    it('should handle long error messages', () => {
      const longMessage = 'A'.repeat(500); // Very long error message
      const response = createErrorResponse(400, longMessage);

      const responseBody = JSON.parse(response.body);
      expect(responseBody.error).toBe(longMessage);
    });

    it('should include timestamp in all error responses', () => {
      const response = createErrorResponse(500, 'Server error');

      const responseBody = JSON.parse(response.body);
      expect(responseBody.timestamp).toBe(mockTimestamp);
    });
  });

  describe('Response consistency', () => {
    it('should maintain consistent header structure across all response types', () => {
      const successResponse = createSuccessResponse({ message: 'Success' });
      const errorResponse = createErrorResponse(400, 'Error');
      const basicResponse = createResponse(200, { message: 'Basic' });

      const expectedHeaders = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers':
          'Content-Type,X-Amz-Date,Authorization,X-Api-Key',
        'Access-Control-Allow-Methods': 'POST,OPTIONS',
      };

      expect(successResponse.headers).toEqual(expectedHeaders);
      expect(errorResponse.headers).toEqual(expectedHeaders);
      expect(basicResponse.headers).toEqual(expectedHeaders);
    });

    it('should ensure all responses return valid JSON', () => {
      const responses = [
        createSuccessResponse({ data: 'test' }),
        createErrorResponse(400, 'Test error'),
        createResponse(201, { created: true }),
      ];
      responses.forEach((response) => {
        expect(() => JSON.parse(response.body)).not.toThrow();
        expect(response.headers?.['Content-Type']).toBe('application/json');
      });
    });
  });
});
