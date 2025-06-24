/**
 * Structured logging utility for the Zik application
 */

export class Logger {
  /**
   * Safe JSON stringify that handles circular references
   */
  private static safeStringify(obj: any): string {
    const seen = new WeakSet();
    return JSON.stringify(obj, (key, value) => {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return '[Circular]';
        }
        seen.add(value);
      }
      return value;
    });
  }

  static info(message: string, metadata?: any) {
    console.log(
      Logger.safeStringify({
        level: 'INFO',
        timestamp: new Date().toISOString(),
        message,
        ...metadata,
      })
    );
  }

  static debug(message: string, metadata?: any) {
    console.log(
      Logger.safeStringify({
        level: 'DEBUG',
        timestamp: new Date().toISOString(),
        message,
        ...metadata,
      })
    );
  }

  static error(message: string, error?: any, metadata?: any) {
    console.error(
      Logger.safeStringify({
        level: 'ERROR',
        timestamp: new Date().toISOString(),
        message,
        error:
          error instanceof Error
            ? {
                name: error.name,
                message: error.message,
                stack: error.stack,
              }
            : error,
        ...metadata,
      })
    );
  }

  static warn(message: string, metadata?: any) {
    console.warn(
      Logger.safeStringify({
        level: 'WARN',
        timestamp: new Date().toISOString(),
        message,
        ...metadata,
      })
    );
  }
}
