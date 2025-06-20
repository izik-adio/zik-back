import { handler } from '../../lambda/registerUser';
import { APIGatewayProxyEvent } from 'aws-lambda';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';

const ddbMock = mockClient(DynamoDBDocumentClient);
const sesMock = mockClient(SESClient);

describe('Register User Handler', () => {
  beforeEach(() => {
    ddbMock.reset();
    sesMock.reset();
    process.env.USERS_TABLE_NAME = 'test-users-table';
    process.env.EMAIL_FROM_ADDRESS = 'test@example.com';
    process.env.API_GATEWAY_URL = 'https://api.example.com';
  });

  afterEach(() => {
    delete process.env.USERS_TABLE_NAME;
    delete process.env.EMAIL_FROM_ADDRESS;
    delete process.env.API_GATEWAY_URL;
  });

  it('should register a new user successfully', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });
    ddbMock.on(PutCommand).resolves({});
    sesMock.on(SendEmailCommand).resolves({});

    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'Password123',
        userName: 'testuser',
      }),
      requestContext: {
        identity: {
          sourceIp: '127.0.0.1',
        },
      },
    } as any;

    const response = await handler(event);

    expect(response.statusCode).toBe(201);
    expect(JSON.parse(response.body).message).toBe(
      'User registered successfully and auto-verified for testing.'
    );
    expect(ddbMock).toHaveReceivedCommand(PutCommand);
    // SES should not be called in test env due to auto-verification
    expect(sesMock).not.toHaveReceivedCommand(SendEmailCommand);
  });

  it('should return 409 if email is already in use', async () => {
    ddbMock
      .on(QueryCommand)
      .resolves({ Items: [{ email: 'test@example.com' }] });

    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'Password123',
        userName: 'testuser',
      }),
      requestContext: {
        identity: {
          sourceIp: '127.0.0.1',
        },
      },
    } as any;

    const response = await handler(event);

    expect(response.statusCode).toBe(409);
    expect(JSON.parse(response.body).message).toBe(
      'User with this email already exists'
    );
  });

  it('should return 400 for invalid input', async () => {
    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({
        email: 'test@example.com',
      }),
      requestContext: {
        identity: {
          sourceIp: '127.0.0.1',
        },
      },
    } as any;

    const response = await handler(event);

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toBe(
      'Email, password, and userName are required'
    );
  });
});
