import { handler } from '../../lambda/refreshToken';
import { APIGatewayProxyEvent } from 'aws-lambda';
import {
  DynamoDBDocumentClient,
  GetCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import * as jwt from 'jsonwebtoken';

const ddbMock = mockClient(DynamoDBDocumentClient);

jest.mock('../../lambda/utils/auth');

describe('Refresh Token Handler', () => {
  beforeEach(() => {
    ddbMock.reset();
    process.env.USERS_TABLE_NAME = 'test-users-table';
    process.env.JWT_SECRET_ARN =
      'arn:aws:secretsmanager:us-east-1:123456789012:secret:test-secret-123456';
  });

  afterEach(() => {
    delete process.env.USERS_TABLE_NAME;
    delete process.env.JWT_SECRET_ARN;
  });

  it('should refresh tokens successfully', async () => {
    ddbMock.on(GetCommand).resolves({
      Item: {
        userId: 'user123',
        email: 'test@example.com',
        refreshTokens: ['valid-refresh-token'],
      },
    });
    ddbMock.on(UpdateCommand).resolves({});

    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({ refreshToken: 'valid-refresh-token' }),
    } as any;

    const response = await handler(event);

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.message).toBe('Tokens refreshed successfully');
    expect(body.tokens.accessToken).toBeDefined();
    expect(body.tokens.refreshToken).toBeDefined();
    expect(ddbMock).toHaveReceivedCommand(UpdateCommand);
  });

  it('should return 401 for invalid refresh token', async () => {
    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({ refreshToken: 'invalid-refresh-token' }),
    } as any;

    const response = await handler(event);

    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body).message).toBe(
      'Invalid or expired refresh token'
    );
  });
});
