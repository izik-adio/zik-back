import { handler } from '../../lambda/loginUser';
import { APIGatewayProxyEvent } from 'aws-lambda';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import * as bcrypt from 'bcryptjs';

const ddbMock = mockClient(DynamoDBDocumentClient);

jest.mock('../../lambda/utils/auth');

describe('Login User Handler', () => {
  const mockPassword = 'Password123';
  const mockHashedPassword = bcrypt.hashSync(mockPassword, 10);

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

  it('should login a user successfully', async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [
        {
          email: 'test@example.com',
          hashedPassword: mockHashedPassword,
          isEmailVerified: true,
          userId: 'user123',
        },
      ],
    });
    ddbMock.on(UpdateCommand).resolves({});

    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({
        email: 'test@example.com',
        password: mockPassword,
      }),
      requestContext: {
        identity: {
          sourceIp: '127.0.0.1',
        },
      },
    } as any;

    const response = await handler(event);

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.message).toBe('Login successful');
    expect(body.tokens.accessToken).toBeDefined();
    expect(body.tokens.refreshToken).toBeDefined();
    expect(ddbMock).toHaveReceivedCommand(UpdateCommand);
  });

  it('should return 401 for incorrect password', async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [
        {
          email: 'test@example.com',
          hashedPassword: mockHashedPassword,
          isEmailVerified: true,
          userId: 'user123',
        },
      ],
    });

    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'WrongPassword123',
      }),
      requestContext: {
        identity: {
          sourceIp: '127.0.0.1',
        },
      },
    } as any;

    const response = await handler(event);

    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body).message).toBe(
      'Invalid credentials (password mismatch)'
    );
  });

  it('should return 401 for non-existent email', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });

    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({
        email: 'nonexistent@example.com',
        password: 'Password123',
      }),
      requestContext: {
        identity: {
          sourceIp: '127.0.0.1',
        },
      },
    } as any;

    const response = await handler(event);

    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body).message).toBe(
      'Invalid credentials (user not found)'
    );
  });

  it('should return 403 for unverified email', async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [
        {
          email: 'test@example.com',
          hashedPassword: mockHashedPassword,
          isEmailVerified: false,
          userId: 'user123',
        },
      ],
    });

    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({
        email: 'test@example.com',
        password: mockPassword,
      }),
      requestContext: {
        identity: {
          sourceIp: '127.0.0.1',
        },
      },
    } as any;

    const response = await handler(event);

    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body).message).toBe(
      'Email not verified. Please check your email.'
    );
  });
});
