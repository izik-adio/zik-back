import { handler } from '../../lambda/verifyEmail';
import { APIGatewayProxyEvent } from 'aws-lambda';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';

const ddbMock = mockClient(DynamoDBDocumentClient);

describe('Verify Email Handler', () => {
  beforeEach(() => {
    ddbMock.reset();
    process.env.USERS_TABLE_NAME = 'test-users-table';
  });

  afterEach(() => {
    delete process.env.USERS_TABLE_NAME;
  });

  it('should verify email successfully', async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [
        {
          userId: 'user123',
          email: 'test@example.com',
          verificationToken: 'valid-token',
          isEmailVerified: false,
        },
      ],
    });
    ddbMock.on(UpdateCommand).resolves({});

    const event: APIGatewayProxyEvent = {
      queryStringParameters: {
        token: 'valid-token',
        email: 'test@example.com',
      },
    } as any;

    const response = await handler(event);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).message).toBe(
      'Email verified successfully. You can now log in.'
    );
    expect(ddbMock).toHaveReceivedCommand(UpdateCommand);
  });

  it('should return 400 for invalid token', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });

    const event: APIGatewayProxyEvent = {
      queryStringParameters: {
        token: 'invalid-token',
        email: 'test@example.com',
      },
    } as any;

    const response = await handler(event);

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toContain(
      'Invalid or expired verification token'
    );
  });
});
