/**
 * Unit tests for custom error classes
 * Tests error inheritance and properties
 */
import {
  AuthError,
  ValidationError,
  DatabaseError,
  BedrockError,
  NotFoundError,
} from '../errors';

describe('Custom Error Classes', () => {
  describe('AuthError', () => {
    it('should create AuthError with correct properties', () => {
      const message = 'Authentication failed';
      const error = new AuthError(message);

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AuthError);
      expect(error.message).toBe(message);
      expect(error.name).toBe('AuthError');
    });

    it('should have stack trace', () => {
      const error = new AuthError('Test error');
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('AuthError');
      expect(error.stack).toContain('Test error');
    });

    it('should be distinguishable from other error types', () => {
      const authError = new AuthError('Auth failed');
      const validationError = new ValidationError('Validation failed');
      const databaseError = new DatabaseError('DB failed');

      expect(authError instanceof AuthError).toBe(true);
      expect(authError instanceof ValidationError).toBe(false);
      expect(authError instanceof DatabaseError).toBe(false);

      expect(validationError instanceof AuthError).toBe(false);
      expect(databaseError instanceof AuthError).toBe(false);
    });
  });

  describe('ValidationError', () => {
    it('should create ValidationError with correct properties', () => {
      const message = 'Invalid input format';
      const error = new ValidationError(message);

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.message).toBe(message);
      expect(error.name).toBe('ValidationError');
    });

    it('should handle field-specific validation errors', () => {
      const testCases = [
        'Email format is invalid',
        'Password must be at least 8 characters',
        'Date format must be YYYY-MM-DD',
        'Required field is missing',
        'Value exceeds maximum limit',
      ];

      testCases.forEach((message) => {
        const error = new ValidationError(message);
        expect(error.message).toBe(message);
        expect(error.name).toBe('ValidationError');
        expect(error instanceof ValidationError).toBe(true);
      });
    });

    it('should have stack trace', () => {
      const error = new ValidationError('Validation failed');
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('ValidationError');
    });
  });

  describe('DatabaseError', () => {
    it('should create DatabaseError with correct properties', () => {
      const message = 'Database connection failed';
      const error = new DatabaseError(message);

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(DatabaseError);
      expect(error.message).toBe(message);
      expect(error.name).toBe('DatabaseError');
    });

    it('should create DatabaseError with original error', () => {
      const message = 'Query execution failed';
      const originalError = new Error('Timeout after 30 seconds');
      const error = new DatabaseError(message, originalError);

      expect(error.message).toBe(message);
      expect(error.cause).toBe(originalError);
      expect(error.name).toBe('DatabaseError');
    });

    it('should handle DatabaseError without original error', () => {
      const message = 'Simple database error';
      const error = new DatabaseError(message);

      expect(error.message).toBe(message);
      expect(error.cause).toBeUndefined();
      expect(error.name).toBe('DatabaseError');
    });

    it('should handle various database operation errors', () => {
      const operations = [
        'Failed to create item',
        'Failed to update item',
        'Failed to delete item',
        'Failed to query items',
        'Table not found',
        'Connection timeout',
        'Invalid table name',
      ];

      operations.forEach((message) => {
        const error = new DatabaseError(message);
        expect(error.message).toBe(message);
        expect(error instanceof DatabaseError).toBe(true);
      });
    });
  });

  describe('BedrockError', () => {
    it('should create BedrockError with correct properties', () => {
      const message = 'Bedrock API call failed';
      const error = new BedrockError(message);

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(BedrockError);
      expect(error.message).toBe(message);
      expect(error.name).toBe('BedrockError');
    });

    it('should create BedrockError with original error', () => {
      const message = 'Model invocation failed';
      const originalError = new Error('Rate limit exceeded');
      const error = new BedrockError(message, originalError);

      expect(error.message).toBe(message);
      expect(error.cause).toBe(originalError);
      expect(error.name).toBe('BedrockError');
    });

    it('should handle BedrockError without original error', () => {
      const message = 'Simple Bedrock error';
      const error = new BedrockError(message);

      expect(error.message).toBe(message);
      expect(error.cause).toBeUndefined();
      expect(error.name).toBe('BedrockError');
    });

    it('should handle AI service specific errors', () => {
      const aiErrors = [
        'Model not available',
        'Token limit exceeded',
        'Invalid prompt format',
        'Response generation failed',
        'Service temporarily unavailable',
      ];

      aiErrors.forEach((message) => {
        const error = new BedrockError(message);
        expect(error.message).toBe(message);
        expect(error instanceof BedrockError).toBe(true);
      });
    });
  });

  describe('NotFoundError', () => {
    it('should create NotFoundError with correct properties', () => {
      const message = 'Resource not found';
      const error = new NotFoundError(message);

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(NotFoundError);
      expect(error.message).toBe(message);
      expect(error.name).toBe('NotFoundError');
    });

    it('should handle various resource not found scenarios', () => {
      const resources = [
        'Task not found',
        'Goal not found',
        'User not found',
        'Chat message not found',
        'Session not found',
      ];

      resources.forEach((message) => {
        const error = new NotFoundError(message);
        expect(error.message).toBe(message);
        expect(error instanceof NotFoundError).toBe(true);
      });
    });

    it('should have stack trace', () => {
      const error = new NotFoundError('Resource not found');
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('NotFoundError');
    });
  });

  describe('Error inheritance and type checking', () => {
    it('should maintain proper inheritance chain', () => {
      const errors = [
        new AuthError('Auth error'),
        new ValidationError('Validation error'),
        new DatabaseError('Database error'),
        new BedrockError('Bedrock error'),
        new NotFoundError('Not found error'),
      ];

      errors.forEach((error) => {
        expect(error instanceof Error).toBe(true);
        expect(error.name).not.toBe('Error');
      });
    });

    it('should allow type discrimination by error type', () => {
      const errors = [
        new AuthError('Auth error'),
        new ValidationError('Validation error'),
        new DatabaseError('Database error'),
        new BedrockError('Bedrock error'),
        new NotFoundError('Not found error'),
      ];

      function handleError(error: Error): string {
        if (error instanceof AuthError) {
          return 'Handle authentication error';
        } else if (error instanceof ValidationError) {
          return 'Handle validation error';
        } else if (error instanceof DatabaseError) {
          return 'Handle database error';
        } else if (error instanceof BedrockError) {
          return 'Handle Bedrock error';
        } else if (error instanceof NotFoundError) {
          return 'Handle not found error';
        } else {
          return 'Handle generic error';
        }
      }

      const expectedResults = [
        'Handle authentication error',
        'Handle validation error',
        'Handle database error',
        'Handle Bedrock error',
        'Handle not found error',
      ];

      errors.forEach((error, index) => {
        expect(handleError(error)).toBe(expectedResults[index]);
      });
    });

    it('should support error name-based switching', () => {
      const errors = [
        new AuthError('Auth error'),
        new ValidationError('Validation error'),
        new DatabaseError('Database error'),
        new BedrockError('Bedrock error'),
        new NotFoundError('Not found error'),
      ];

      const expectedNames = [
        'AuthError',
        'ValidationError',
        'DatabaseError',
        'BedrockError',
        'NotFoundError',
      ];

      errors.forEach((error, index) => {
        expect(error.name).toBe(expectedNames[index]);
      });
    });
  });

  describe('Error serialization and debugging', () => {
    it('should serialize error properties correctly', () => {
      const originalError = new Error('Original cause');
      const error = new DatabaseError(
        'Database operation failed',
        originalError
      );

      // Test that error can be converted to JSON for logging
      const serializable = {
        name: error.name,
        message: error.message,
        cause: error.cause,
        stack: error.stack,
      };

      expect(serializable.name).toBe('DatabaseError');
      expect(serializable.message).toBe('Database operation failed');
      expect(serializable.cause).toBe(originalError);
      expect(serializable.stack).toBeDefined();
    });

    it('should handle errors without cause', () => {
      const error = new ValidationError('Validation failed');

      const serializable = {
        name: error.name,
        message: error.message,
        cause: (error as any).cause,
      };

      expect(serializable.name).toBe('ValidationError');
      expect(serializable.message).toBe('Validation failed');
      expect(serializable.cause).toBeUndefined();
    });

    it('should preserve stack traces', () => {
      function throwAuthError() {
        throw new AuthError('Authentication failed');
      }

      function throwValidationError() {
        throw new ValidationError('Validation failed');
      }

      try {
        throwAuthError();
      } catch (error) {
        expect(error).toBeInstanceOf(AuthError);
        expect((error as AuthError).stack).toContain('throwAuthError');
        expect((error as AuthError).stack).toContain('AuthError');
      }

      try {
        throwValidationError();
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).stack).toContain(
          'throwValidationError'
        );
        expect((error as ValidationError).stack).toContain('ValidationError');
      }
    });
  });

  describe('Error message handling', () => {
    it('should handle empty error messages', () => {
      const errors = [
        new AuthError(''),
        new ValidationError(''),
        new DatabaseError(''),
        new BedrockError(''),
        new NotFoundError(''),
      ];

      errors.forEach((error) => {
        expect(error.message).toBe('');
        expect(error.name).toBeDefined();
        expect(error instanceof Error).toBe(true);
      });
    });

    it('should handle very long error messages', () => {
      const longMessage = 'A'.repeat(10000);
      const error = new DatabaseError(longMessage);

      expect(error.message).toBe(longMessage);
      expect(error.message.length).toBe(10000);
    });

    it('should handle special characters in error messages', () => {
      const specialMessage = 'Error with special chars: <>&"\'`\n\t\r';
      const error = new ValidationError(specialMessage);

      expect(error.message).toBe(specialMessage);
    });
  });

  describe('Error cause handling', () => {
    it('should handle different types of original errors in DatabaseError', () => {
      const testCases = [
        {
          originalError: new Error('Standard error'),
          description: 'Error object',
        },
        { originalError: 'String error', description: 'String error' },
        {
          originalError: { code: 'ERR001', message: 'Custom error' },
          description: 'Object error',
        },
        { originalError: null, description: 'Null error' },
        { originalError: undefined, description: 'Undefined error' },
      ];

      testCases.forEach(({ originalError, description }) => {
        const error = new DatabaseError('Database failed', originalError);
        expect(error.cause).toBe(originalError);
        expect(error.message).toBe('Database failed');
      });
    });

    it('should handle different types of original errors in BedrockError', () => {
      const testCases = [
        {
          originalError: new Error('Bedrock timeout'),
          description: 'Error object',
        },
        { originalError: 'Rate limit exceeded', description: 'String error' },
        {
          originalError: { statusCode: 429, message: 'Too many requests' },
          description: 'Object error',
        },
      ];

      testCases.forEach(({ originalError, description }) => {
        const error = new BedrockError(
          'Bedrock operation failed',
          originalError
        );
        expect(error.cause).toBe(originalError);
        expect(error.message).toBe('Bedrock operation failed');
      });
    });
  });
});
