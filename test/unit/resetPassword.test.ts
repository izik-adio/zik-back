import { handler } from '../../lambda/resetPassword';
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

describe('Reset Password Handler', () => {
  beforeEach(() => {
    ddbMock.reset();
    process.env.USERS_TABLE_NAME = 'test-users-table';
  });

  afterEach(() => {
    delete process.env.USERS_TABLE_NAME;
  });

  it('should reset password successfully', async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [
        {
          userId: 'user123',
          passwordResetToken: 'valid-token',
          passwordResetTokenExpiresAt: new Date(
            Date.now() + 3600000
          ).toISOString(),
        },
      ],
    });
    ddbMock.on(UpdateCommand).resolves({});

    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({
        token: 'valid-token',
        newPassword: 'NewPassword123',
      }),
    } as any;

    const response = await handler(event);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).message).toBe(
      'Password has been reset successfully.'
    );
    expect(ddbMock).toHaveReceivedCommand(UpdateCommand);
  });

  it('should return 400 for invalid token', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });

    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({
        token: 'invalid-token',
        newPassword: 'NewPassword123',
      }),
    } as any;

    const response = await handler(event);

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toBe(
      'Invalid or expired reset token.'
    );
  });
});
