/**
 * Unit tests for Cognito Custom Message Lambda Function
 */

import { jest } from '@jest/globals';
import { CustomMessageTriggerEvent, Context } from 'aws-lambda';
import { handler } from '../cognitoCustomMessage';

// Mock logger
jest.mock('../../src/utils/logger', () => ({
  Logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('Cognito Custom Message Handler', () => {
  const mockContext: Context = {
    callbackWaitsForEmptyEventLoop: false,
    functionName: 'test-function',
    functionVersion: '1',
    invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test',
    memoryLimitInMB: '128',
    awsRequestId: 'test-request-id',
    logGroupName: '/aws/lambda/test',
    logStreamName: 'test-stream',
    getRemainingTimeInMillis: () => 30000,
    done: jest.fn(),
    fail: jest.fn(),
    succeed: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should customize email for signup verification', async () => {
    const event: CustomMessageTriggerEvent = {
      version: '1',
      region: 'us-east-1',
      userPoolId: 'us-east-1_TestPool',
      userName: 'testuser',
      callerContext: {
        awsSdkVersion: '3.0.0',
        clientId: 'test-client-id',
      },
      triggerSource: 'CustomMessage_SignUp',
      request: {
        userAttributes: {
          email: 'test@example.com',
        },
        codeParameter: '123456',
        linkParameter: 'https://example.com/verify?code=123456',
        usernameParameter: 'testuser',
        clientMetadata: {},
      },
      response: {
        emailSubject: '',
        emailMessage: '',
        smsMessage: '',
      },
    };

    const result = await handler(event, mockContext);

    expect(result.response.emailSubject).toBe(
      'Welcome to Zik! Verify your email address'
    );
    expect(result.response.emailMessage).toContain('123456');
    expect(result.response.emailMessage).toContain('Welcome to Zik! 🎯');
    expect(result.response.emailMessage).toContain('verify your email address');
  });

  it('should customize email for password reset', async () => {
    const event: CustomMessageTriggerEvent = {
      version: '1',
      region: 'us-east-1',
      userPoolId: 'us-east-1_TestPool',
      userName: 'testuser',
      callerContext: {
        awsSdkVersion: '3.0.0',
        clientId: 'test-client-id',
      },
      triggerSource: 'CustomMessage_ForgotPassword',
      request: {
        userAttributes: {
          email: 'test@example.com',
        },
        codeParameter: '654321',
        linkParameter: 'https://example.com/reset?code=654321',
        usernameParameter: 'testuser',
        clientMetadata: {},
      },
      response: {
        emailSubject: '',
        emailMessage: '',
        smsMessage: '',
      },
    };

    const result = await handler(event, mockContext);

    expect(result.response.emailSubject).toBe('Reset your Zik password');
    expect(result.response.emailMessage).toContain('654321');
    expect(result.response.emailMessage).toContain('Reset Your Password 🔒');
    expect(result.response.emailMessage).toContain('reset your password');
  });

  it('should customize email for admin user invitation', async () => {
    const event: CustomMessageTriggerEvent = {
      version: '1',
      region: 'us-east-1',
      userPoolId: 'us-east-1_TestPool',
      userName: 'inviteduser',
      callerContext: {
        awsSdkVersion: '3.0.0',
        clientId: 'test-client-id',
      },
      triggerSource: 'CustomMessage_AdminCreateUser',
      request: {
        userAttributes: {
          email: 'invited@example.com',
        },
        codeParameter: 'TempPass123!',
        linkParameter: 'https://example.com/login',
        usernameParameter: 'inviteduser',
        clientMetadata: {},
      },
      response: {
        emailSubject: '',
        emailMessage: '',
        smsMessage: '',
      },
    };

    const result = await handler(event, mockContext);

    expect(result.response.emailSubject).toBe("You're invited to join Zik!");
    expect(result.response.emailMessage).toContain('TempPass123!');
    expect(result.response.emailMessage).toContain('inviteduser');
    expect(result.response.emailMessage).toContain('invited to join Zik');
  });

  it('should handle unknown trigger sources gracefully', async () => {
    const event: CustomMessageTriggerEvent = {
      version: '1',
      region: 'us-east-1',
      userPoolId: 'us-east-1_TestPool',
      userName: 'testuser',
      callerContext: {
        awsSdkVersion: '3.0.0',
        clientId: 'test-client-id',
      },
      triggerSource: 'CustomMessage_Unknown' as any,
      request: {
        userAttributes: {
          email: 'test@example.com',
        },
        codeParameter: '123456',
        linkParameter: 'https://example.com/unknown',
        usernameParameter: 'testuser',
        clientMetadata: {},
      },
      response: {
        emailSubject: '',
        emailMessage: '',
        smsMessage: '',
      },
    };

    const result = await handler(event, mockContext);

    // Should return the event unchanged for unknown trigger sources
    expect(result.response.emailSubject).toBe('');
    expect(result.response.emailMessage).toBe('');
  });

  it('should handle errors gracefully and return unchanged event', async () => {
    const event: CustomMessageTriggerEvent = {
      version: '1',
      region: 'us-east-1',
      userPoolId: 'us-east-1_TestPool',
      userName: 'testuser',
      callerContext: {
        awsSdkVersion: '3.0.0',
        clientId: 'test-client-id',
      },
      triggerSource: 'CustomMessage_SignUp',
      request: {
        userAttributes: {
          email: 'test@example.com',
        },
        codeParameter: null as any, // This might cause an error
        linkParameter: 'https://example.com/error',
        usernameParameter: 'testuser',
        clientMetadata: {},
      },
      response: {
        emailSubject: '',
        emailMessage: '',
        smsMessage: '',
      },
    };

    const result = await handler(event, mockContext);

    // Should handle errors gracefully and still return the event
    expect(result).toBeDefined();
  });
});
