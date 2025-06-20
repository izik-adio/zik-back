export const createCorsHeaders = () => ({
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'Content-Type,X-Amz-Date,Authorization,X-Api-Key',
  'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE',
});

export const createSuccessResponse = (statusCode: number, data: any) => ({
  statusCode,
  headers: createCorsHeaders(),
  body: JSON.stringify(data),
});

export const createErrorResponse = (
  statusCode: number,
  message: string,
  error?: string
) => ({
  statusCode,
  headers: createCorsHeaders(),
  body: JSON.stringify({
    message,
    ...(error && { error }),
  }),
});
