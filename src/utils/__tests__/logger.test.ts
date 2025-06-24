/**
 * Unit tests for Logger utility functions
 * Tests structured logging functionality
 */
import { Logger } from '../logger';

describe('Logger Utility', () => {
  const mockTimestamp = '2025-06-23T10:00:00.000Z';

  // Mock console methods
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;

  const mockConsoleLog = jest.fn();
  const mockConsoleError = jest.fn();
  const mockConsoleWarn = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock console methods
    console.log = mockConsoleLog;
    console.error = mockConsoleError;
    console.warn = mockConsoleWarn;

    // Mock Date.prototype.toISOString
    jest.spyOn(Date.prototype, 'toISOString').mockReturnValue(mockTimestamp);
  });

  afterEach(() => {
    // Restore original console methods
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;

    jest.restoreAllMocks();
  });

  describe('Logger.info', () => {
    it('should log info message with correct structure', () => {
      const message = 'User authentication successful';
      const metadata = { userId: 'user-123', action: 'login' };

      Logger.info(message, metadata);

      expect(mockConsoleLog).toHaveBeenCalledWith(
        JSON.stringify({
          level: 'INFO',
          timestamp: mockTimestamp,
          message: message,
          userId: 'user-123',
          action: 'login',
        })
      );
    });

    it('should log info message without metadata', () => {
      const message = 'Service started successfully';

      Logger.info(message);

      expect(mockConsoleLog).toHaveBeenCalledWith(
        JSON.stringify({
          level: 'INFO',
          timestamp: mockTimestamp,
          message: message,
        })
      );
    });

    it('should handle empty metadata object', () => {
      const message = 'Test message';

      Logger.info(message, {});

      expect(mockConsoleLog).toHaveBeenCalledWith(
        JSON.stringify({
          level: 'INFO',
          timestamp: mockTimestamp,
          message: message,
        })
      );
    });

    it('should handle complex metadata objects', () => {
      const message = 'Complex operation completed';
      const metadata = {
        userId: 'user-456',
        operation: {
          type: 'database',
          table: 'tasks',
          action: 'create',
          data: {
            taskId: 'task-789',
            title: 'Test Task',
          },
        },
        performance: {
          duration: 150,
          memoryUsage: '25MB',
        },
      };

      Logger.info(message, metadata);

      const expectedOutput = {
        level: 'INFO',
        timestamp: mockTimestamp,
        message: message,
        ...metadata,
      };

      expect(mockConsoleLog).toHaveBeenCalledWith(
        JSON.stringify(expectedOutput)
      );
    });
  });

  describe('Logger.debug', () => {
    it('should log debug message with correct structure', () => {
      const message = 'Processing user request';
      const metadata = { requestId: 'req-123', endpoint: '/api/tasks' };

      Logger.debug(message, metadata);

      expect(mockConsoleLog).toHaveBeenCalledWith(
        JSON.stringify({
          level: 'DEBUG',
          timestamp: mockTimestamp,
          message: message,
          requestId: 'req-123',
          endpoint: '/api/tasks',
        })
      );
    });

    it('should log debug message without metadata', () => {
      const message = 'Entering function processTask';

      Logger.debug(message);

      expect(mockConsoleLog).toHaveBeenCalledWith(
        JSON.stringify({
          level: 'DEBUG',
          timestamp: mockTimestamp,
          message: message,
        })
      );
    });
  });

  describe('Logger.warn', () => {
    it('should log warning message with correct structure', () => {
      const message = 'Deprecated API endpoint used';
      const metadata = {
        endpoint: '/api/v1/tasks',
        replacement: '/api/v2/tasks',
      };

      Logger.warn(message, metadata);

      expect(mockConsoleWarn).toHaveBeenCalledWith(
        JSON.stringify({
          level: 'WARN',
          timestamp: mockTimestamp,
          message: message,
          endpoint: '/api/v1/tasks',
          replacement: '/api/v2/tasks',
        })
      );
    });

    it('should log warning message without metadata', () => {
      const message = 'Rate limit approaching';

      Logger.warn(message);

      expect(mockConsoleWarn).toHaveBeenCalledWith(
        JSON.stringify({
          level: 'WARN',
          timestamp: mockTimestamp,
          message: message,
        })
      );
    });
  });

  describe('Logger.error', () => {
    it('should log error message with Error object', () => {
      const message = 'Database operation failed';
      const error = new Error('Connection timeout');
      error.stack =
        'Error: Connection timeout\n    at Database.connect (/app/db.js:25:10)';
      const metadata = { operation: 'create', table: 'tasks' };

      Logger.error(message, error, metadata);

      expect(mockConsoleError).toHaveBeenCalledWith(
        JSON.stringify({
          level: 'ERROR',
          timestamp: mockTimestamp,
          message: message,
          error: {
            name: 'Error',
            message: 'Connection timeout',
            stack:
              'Error: Connection timeout\n    at Database.connect (/app/db.js:25:10)',
          },
          operation: 'create',
          table: 'tasks',
        })
      );
    });

    it('should log error message with string error', () => {
      const message = 'Authentication failed';
      const error = 'Invalid token format';
      const metadata = { userId: 'user-123' };

      Logger.error(message, error, metadata);

      expect(mockConsoleError).toHaveBeenCalledWith(
        JSON.stringify({
          level: 'ERROR',
          timestamp: mockTimestamp,
          message: message,
          error: 'Invalid token format',
          userId: 'user-123',
        })
      );
    });

    it('should log error message without error object', () => {
      const message = 'Unknown error occurred';
      const metadata = { context: 'user-registration' };

      Logger.error(message, undefined, metadata);

      expect(mockConsoleError).toHaveBeenCalledWith(
        JSON.stringify({
          level: 'ERROR',
          timestamp: mockTimestamp,
          message: message,
          context: 'user-registration',
        })
      );
    });

    it('should log error message without metadata', () => {
      const message = 'Service unavailable';
      const error = new Error('Service down');

      Logger.error(message, error);

      expect(mockConsoleError).toHaveBeenCalledWith(
        JSON.stringify({
          level: 'ERROR',
          timestamp: mockTimestamp,
          message: message,
          error: {
            name: 'Error',
            message: 'Service down',
            stack: error.stack,
          },
        })
      );
    });

    it('should handle custom error objects', () => {
      const message = 'Custom error occurred';
      const customError = {
        code: 'AUTH_001',
        message: 'Authentication failed',
        details: { reason: 'token_expired' },
      };

      Logger.error(message, customError);

      expect(mockConsoleError).toHaveBeenCalledWith(
        JSON.stringify({
          level: 'ERROR',
          timestamp: mockTimestamp,
          message: message,
          error: customError,
        })
      );
    });

    it('should handle Error objects with additional properties', () => {
      const message = 'Enhanced error logging';
      const error = new Error('Database error');
      (error as any).code = 'DB_CONNECTION_FAILED';
      (error as any).retryCount = 3;

      Logger.error(message, error);

      expect(mockConsoleError).toHaveBeenCalledWith(
        JSON.stringify({
          level: 'ERROR',
          timestamp: mockTimestamp,
          message: message,
          error: {
            name: 'Error',
            message: 'Database error',
            stack: error.stack,
          },
        })
      );
    });
  });

  describe('Message sanitization and security', () => {
    it('should handle messages with special characters', () => {
      const message = 'User "admin" logged in with special chars: <>&"\'';
      const metadata = { ip: '192.168.1.1' };

      Logger.info(message, metadata);

      expect(mockConsoleLog).toHaveBeenCalledWith(
        JSON.stringify({
          level: 'INFO',
          timestamp: mockTimestamp,
          message: message,
          ip: '192.168.1.1',
        })
      );
    });

    it('should handle very long messages', () => {
      const longMessage = 'A'.repeat(10000);

      Logger.info(longMessage);

      expect(mockConsoleLog).toHaveBeenCalledWith(
        JSON.stringify({
          level: 'INFO',
          timestamp: mockTimestamp,
          message: longMessage,
        })
      );
    });

    it('should handle null and undefined values in metadata', () => {
      const message = 'Test with null/undefined values';
      const metadata = {
        validValue: 'test',
        nullValue: null,
        undefinedValue: undefined,
        emptyString: '',
        zeroValue: 0,
        falseValue: false,
      };

      Logger.info(message, metadata);

      expect(mockConsoleLog).toHaveBeenCalledWith(
        JSON.stringify({
          level: 'INFO',
          timestamp: mockTimestamp,
          message: message,
          validValue: 'test',
          nullValue: null,
          undefinedValue: undefined,
          emptyString: '',
          zeroValue: 0,
          falseValue: false,
        })
      );
    });
  });

  describe('JSON serialization', () => {
    it('should produce valid JSON output for all log levels', () => {
      const message = 'Test message';
      const metadata = { key: 'value', number: 42, boolean: true };

      Logger.info(message, metadata);
      Logger.debug(message, metadata);
      Logger.warn(message, metadata);
      Logger.error(message, new Error('Test error'), metadata);

      // Check that all outputs are valid JSON
      expect(mockConsoleLog).toHaveBeenCalledTimes(2); // info + debug
      expect(mockConsoleWarn).toHaveBeenCalledTimes(1);
      expect(mockConsoleError).toHaveBeenCalledTimes(1);

      // Verify each output is valid JSON
      const allCalls = [
        ...mockConsoleLog.mock.calls,
        ...mockConsoleWarn.mock.calls,
        ...mockConsoleError.mock.calls,
      ];

      allCalls.forEach((call) => {
        const output = call[0];
        expect(() => JSON.parse(output)).not.toThrow();
      });
    });

    it('should handle circular references in metadata gracefully', () => {
      const message = 'Circular reference test';
      const circularObj: any = { name: 'test' };
      circularObj.self = circularObj;

      // This should not throw an error, but the behavior depends on implementation
      expect(() =>
        Logger.info(message, { circular: circularObj })
      ).not.toThrow();
    });
  });
});
