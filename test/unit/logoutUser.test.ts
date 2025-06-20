import { handler } from '../../lambda/logoutUser';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  DynamoDBDocumentClient,
  UpdateCommand,
  GetCommand,
} from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';

jest.mock('../../lambda/utils/auth', () => ({
  ...jest.requireActual('../../lambda/utils/auth'),
  withAuth:
    (
      handler: (
        event: APIGatewayProxyEvent,
        auth: { userId: string }
      ) => Promise<APIGatewayProxyResult>
    ) =>
    (event: APIGatewayProxyEvent) =>
      handler(event, { userId: 'user123' }),
}));

const ddbMock = mockClient(DynamoDBDocumentClient);

describe('Logout User Handler', () => {
  beforeEach(() => {
    ddbMock.reset();
  });

  it('should logout from a single device', async () => {
    ddbMock.on(GetCommand).resolves({
      Item: {
        userId: 'user123',
        refreshTokens: ['some-refresh-token'],
      },
    });
    ddbMock.on(UpdateCommand).resolves({});
    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({ refreshToken: 'some-refresh-token' }),
    } as any;

    const response = await handler(event);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).message).toBe('Logged out successfully');
    expect(ddbMock).toHaveReceivedCommand(UpdateCommand);
  });

  it('should logout from all devices', async () => {
    ddbMock.on(UpdateCommand).resolves({});
    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({ logoutAll: true }),
    } as any;

    const response = await handler(event);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).message).toBe(
      'Logged out from all devices successfully'
    );
    expect(ddbMock).toHaveReceivedCommand(UpdateCommand);
  });

  it('should handle basic logout', async () => {
    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({}),
    } as any;

    const response = await handler(event);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).message).toBe('Logged out successfully');
  });
});
