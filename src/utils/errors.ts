/**
 * Custom error classes for the Zik application
 */

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class DatabaseError extends Error {
  public cause?: any;

  constructor(message: string, originalError?: any) {
    super(message);
    this.name = 'DatabaseError';
    this.cause = originalError;
  }
}

export class BedrockError extends Error {
  public cause?: any;

  constructor(message: string, originalError?: any) {
    super(message);
    this.name = 'BedrockError';
    this.cause = originalError;
  }
}
