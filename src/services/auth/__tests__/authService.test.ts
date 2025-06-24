/**
 * Unit tests for Authentication service
 * Tests JWT token validation with mocked aws-jwt-verify library
 */
import { jest } from '@jest/globals';
import { verifyTokenAndGetUserId } from '../../authService';
import { AuthError, ValidationError } from '../../../utils/errors';

// Mock the aws-jwt-verify library
jest.mock('aws-jwt-verify', () => ({
  CognitoJwtVerifier: {
    create: jest.fn().mockReturnValue({
      verify: jest.fn(),
    }),
  },
}));

// Mock config
jest.mock('../../../config', () => ({
  config: {
    userPoolId: 'us-east-1_TestPool',
    userPoolClientId: 'test-client-id',
  },
}));

// Mock logger
jest.mock('../../../utils/logger', () => ({
  Logger: {
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

// Get the mocked verifier
const { CognitoJwtVerifier } = require('aws-jwt-verify');
const mockVerifier = CognitoJwtVerifier.create();
const mockVerify = mockVerifier.verify as jest.MockedFunction<
  typeof mockVerifier.verify
>;

describe('Authentication Service', () => {
  const mockUserId = 'test-user-123';
  const validToken =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0LXVzZXItMTIzIn0.test';
  const validAuthHeader = `Bearer ${validToken}`;

  beforeEach(() => {
    jest.clearAllMocks();
  });
  describe('verifyTokenAndGetUserId', () => {
    it('should successfully validate token and return userId', async () => {
      const mockPayload = {
        sub: mockUserId,
        aud: 'test-client-id',
        iss: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_TestPool',
        exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
        iat: Math.floor(Date.now() / 1000),
        token_use: 'access',
      };

      mockVerify.mockResolvedValueOnce(mockPayload);

      const result = await verifyTokenAndGetUserId(validAuthHeader);

      expect(mockVerify).toHaveBeenCalledWith(validToken);
      expect(result).toBe(mockUserId);
    });

    it('should throw ValidationError when authorization header is missing', async () => {
      await expect(verifyTokenAndGetUserId()).rejects.toThrow(ValidationError);
      await expect(verifyTokenAndGetUserId()).rejects.toThrow(
        'Missing or invalid Authorization header'
      );
    });

    it('should throw ValidationError when authorization header is empty', async () => {
      await expect(verifyTokenAndGetUserId('')).rejects.toThrow(
        ValidationError
      );
      await expect(verifyTokenAndGetUserId('')).rejects.toThrow(
        'Missing or invalid Authorization header'
      );
    });
    it('should throw ValidationError when authorization header does not start with Bearer', async () => {
      await expect(verifyTokenAndGetUserId('InvalidHeader')).rejects.toThrow(
        ValidationError
      );
      await expect(verifyTokenAndGetUserId('InvalidHeader')).rejects.toThrow(
        'Missing or invalid Authorization header'
      );
    });

    it('should throw ValidationError when authorization header uses wrong protocol', async () => {
      await expect(
        verifyTokenAndGetUserId('Basic dGVzdDp0ZXN0')
      ).rejects.toThrow(ValidationError);
      await expect(
        verifyTokenAndGetUserId('Basic dGVzdDp0ZXN0')
      ).rejects.toThrow('Missing or invalid Authorization header');
    });

    it('should throw AuthError when token verification fails', async () => {
      const verificationError = new Error('Token expired');
      mockVerify.mockRejectedValueOnce(verificationError);

      await expect(verifyTokenAndGetUserId(validAuthHeader)).rejects.toThrow(
        AuthError
      );
      await expect(verifyTokenAndGetUserId(validAuthHeader)).rejects.toThrow(
        'Invalid or expired token'
      );

      expect(mockVerify).toHaveBeenCalledWith(validToken);
    });
    it('should throw AuthError when token does not contain sub claim', async () => {
      const mockPayloadWithoutSub = {
        aud: 'test-client-id',
        iss: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_TestPool',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
        token_use: 'access',
        // Missing 'sub' claim
      };

      mockVerify.mockResolvedValue(mockPayloadWithoutSub);

      await expect(verifyTokenAndGetUserId(validAuthHeader)).rejects.toThrow(
        AuthError
      );
      await expect(verifyTokenAndGetUserId(validAuthHeader)).rejects.toThrow(
        'Token does not contain valid user ID'
      );
    });

    it('should throw AuthError when token contains empty sub claim', async () => {
      const mockPayloadWithEmptySub = {
        sub: '',
        aud: 'test-client-id',
        iss: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_TestPool',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
        token_use: 'access',
      };

      mockVerify.mockResolvedValue(mockPayloadWithEmptySub);

      await expect(verifyTokenAndGetUserId(validAuthHeader)).rejects.toThrow(
        AuthError
      );
      await expect(verifyTokenAndGetUserId(validAuthHeader)).rejects.toThrow(
        'Token does not contain valid user ID'
      );
    });
    it('should handle different token verification error types', async () => {
      // Clear mock call history before this test
      jest.clearAllMocks();

      // Test various JWT verification errors
      const errorScenarios = [
        { error: new Error('JwtParseError'), description: 'malformed token' },
        { error: new Error('JwtExpiredError'), description: 'expired token' },
        {
          error: new Error('JwtSignatureVerificationError'),
          description: 'invalid signature',
        },
        {
          error: new Error('JwtAudienceNotAllowedError'),
          description: 'audience mismatch',
        },
        {
          error: new Error('JwtIssuerNotAllowedError'),
          description: 'issuer mismatch',
        },
      ];

      for (const scenario of errorScenarios) {
        mockVerify.mockRejectedValueOnce(scenario.error);
        mockVerify.mockRejectedValueOnce(scenario.error); // For the second expect

        await expect(verifyTokenAndGetUserId(validAuthHeader)).rejects.toThrow(
          AuthError
        );
        await expect(verifyTokenAndGetUserId(validAuthHeader)).rejects.toThrow(
          'Invalid or expired token'
        );
      }

      expect(mockVerify).toHaveBeenCalledTimes(errorScenarios.length * 2); // Each scenario calls twice due to the two expects
    });

    it('should extract token correctly from authorization header', async () => {
      const testCases = [
        'Bearer eyJhbGciOiJIUzI1NiJ9.test',
        'Bearer    eyJhbGciOiJIUzI1NiJ9.test', // Extra spaces
      ];

      const mockPayload = {
        sub: mockUserId,
        aud: 'test-client-id',
        exp: Math.floor(Date.now() / 1000) + 3600,
      };

      for (const authHeader of testCases) {
        mockVerify.mockResolvedValueOnce(mockPayload);

        await verifyTokenAndGetUserId(authHeader);

        const expectedToken = authHeader.substring(7); // Remove 'Bearer '
        expect(mockVerify).toHaveBeenCalledWith(expectedToken);
      }
    });

    it('should handle very long user IDs', async () => {
      const longUserId = 'a'.repeat(100); // Very long user ID
      const mockPayload = {
        sub: longUserId,
        aud: 'test-client-id',
        exp: Math.floor(Date.now() / 1000) + 3600,
      };

      mockVerify.mockResolvedValueOnce(mockPayload);

      const result = await verifyTokenAndGetUserId(validAuthHeader);

      expect(result).toBe(longUserId);
    });
  });
});
