import { handler } from '../../lambda/forgotPassword';
import { APIGatewayProxyEvent } from 'aws-lambda';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';

const ddbMock = mockClient(DynamoDBDocumentClient);
const sesMock = mockClient(SESClient);

describe('Forgot Password Handler', () => {
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

  it('should send a password reset email', async () => {
    ddbMock
      .on(QueryCommand)
      .resolves({
        Items: [
          {
            email: 'test@example.com',
            isEmailVerified: true,
            userId: 'user123',
          },
        ],
      });
    ddbMock.on(UpdateCommand).resolves({});
    sesMock.on(SendEmailCommand).resolves({});

    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({ email: 'test@example.com' }),
      requestContext: { identity: { sourceIp: '127.0.0.1' } },
    } as any;

    const response = await handler(event);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).message).toContain(
      'you will receive a password reset link'
    );
    expect(ddbMock).toHaveReceivedCommand(UpdateCommand);
    expect(sesMock).toHaveReceivedCommand(SendEmailCommand);
  });

  it('should return success for non-existent email', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });

    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({ email: 'nonexistent@example.com' }),
      requestContext: { identity: { sourceIp: '127.0.0.1' } },
    } as any;

    const response = await handler(event);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).message).toContain(
      'you will receive a password reset link'
    );
  });
});
