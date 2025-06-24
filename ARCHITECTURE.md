# Zik Backend - Refactored Architecture

## Overview

This document describes the refactored architecture of the Zik backend, transformed from a monolithic 1,300+ line Lambda function into a clean, service-oriented architecture following software engineering best practices.

## Architecture Blueprint

```
Zik/
├── src/                          # Main source code (clean architecture)
│   ├── lambda/
│   │   ├── chatHandler/
│   │   │   ├── index.ts           # Main chat handler (~200 lines)
│   │   │   └── __tests__/
│   │   │       └── index.test.ts  # Comprehensive integration tests
│   │   └── recurringTaskGenerator/
│   │       └── index.ts           # Scheduled task generator
│   │
│   ├── services/
│   │   ├── auth/
│   │   │   ├── authService.ts     # JWT validation and user identity
│   │   │   └── __tests__/
│   │   │       └── authService.test.ts
│   │   ├── bedrockService.ts      # AI service interactions
│   │   ├── toolExecutor.ts        # Tool execution coordination
│   │   └── database/
│   │       ├── client.ts          # Centralized DynamoDB client
│   │       ├── goals.ts           # Goals CRUD operations
│   │       ├── tasks.ts           # Tasks CRUD operations
│   │       ├── chatMessages.ts    # Chat persistence + context aggregation
│   │       └── __tests__/         # Comprehensive database tests
│   │           ├── goals.test.ts
│   │           ├── tasks.test.ts
│   │           └── chatMessages.test.ts
│   │
│   ├── utils/
│   │   ├── logger.ts              # Structured JSON logging
│   │   ├── errors.ts              # Custom error classes hierarchy
│   │   ├── responses.ts           # HTTP response helpers
│   │   └── __tests__/             # Utility tests
│   │       ├── logger.test.ts
│   │       ├── errors.test.ts
│   │       └── responses.test.ts
│   │
│   ├── types/
│   │   └── index.ts               # Shared TypeScript interfaces
│   │
│   └── config.ts                  # Environment configuration management
│
├── lambda/                        # Legacy Lambda handlers (migrated to src/)
│   ├── manageGoals.ts            # Goals management Lambda
│   └── manageQuests.ts           # Quests management Lambda
│
├── lib/                          # AWS CDK infrastructure code
│   └── zik-backend-stack.ts      # CDK stack definition
│
├── bin/                          # CDK app entry point
│   └── zik-backend.ts            # CDK application
│
├── test/                         # Integration and E2E tests
│
├── dist/                         # TypeScript build output
│   ├── lambda/                   # Compiled Lambda functions
│   └── src/                      # Compiled source modules
│
├── cdk.out/                      # CDK build artifacts (generated)
│
├── node_modules/                 # Dependencies (generated)
│
├── package.json                  # Node.js project configuration
├── tsconfig.json                 # TypeScript configuration
├── jest.config.js                # Test configuration
├── cdk.json                     # CDK configuration
├── ARCHITECTURE.md              # This documentation
├── DOCUMENTATION.md             # API and usage documentation
└── REFACTORING_SUMMARY.md       # Refactoring history and decisions
```

### Optional Files (Developer Utilities)

The following files are present but not part of the core architecture:

```
├── auth-test.js                  # JWT token testing utility
├── chat-test.js                  # Chat API testing utility
├── token-utils.js                # Token generation utility
├── token.json                    # Sample token data
└── token.txt                     # Token storage file
```

These can be safely removed if no longer needed for development/testing.

## Key Improvements

### 1. **Single Responsibility Principle**

Each service and module now has a single, well-defined responsibility:

- `authService`: Handles JWT token validation
- `bedrockService`: Manages AI interactions
- `database/*`: Handles data persistence operations
- `toolExecutor`: Coordinates tool operations

### 2. **Reusability**

Services can now be easily imported and reused by other Lambda functions (e.g., scheduled tasks, webhooks).

### 3. **Testability**

Each service can be unit tested independently with mock dependencies.

### 4. **Maintainability**

- Clear separation of concerns
- Consistent error handling
- Centralized configuration
- Structured logging

### 5. **Type Safety**

All interfaces and types are centralized in `types/index.ts` for consistency across the application.

## Service Descriptions

### Core Services

#### `authService.ts`

- JWT token validation using AWS Cognito
- User identity extraction
- **Key Function**: `verifyTokenAndGetUserId()`

#### `bedrockService.ts`

- Amazon Bedrock client management
- AI prompt construction with context
- Streaming response processing
- Tool call parsing
- **Key Functions**: `buildPrompt()`, `invokeBedrock()`

#### `toolExecutor.ts`

- Coordinates tool execution operations
- Validates tool input parameters
- Routes operations to appropriate database services
- **Key Function**: `executeTool()`

### Database Services

#### `database/client.ts`

- Centralized DynamoDB Document Client instance
- Shared across all database services

#### `database/goals.ts`

- Goals table CRUD operations
- Goal-specific validation logic
- **Key Functions**: `fetchActiveGoals()`, `createGoal()`, `updateGoal()`, `deleteGoal()`

#### `database/tasks.ts`

- Tasks table CRUD operations
- Task-specific validation logic
- **Key Functions**: `fetchTodayTasks()`, `createTask()`, `updateTask()`, `deleteTask()`

#### `database/chatMessages.ts`

- Chat messages persistence
- User profile fetching
- Context aggregation (combines all user data)
- **Key Function**: `getContextForUser()` - Fetches all user context in parallel

### Utility Services

#### `utils/logger.ts`

- Structured JSON logging
- Consistent log levels (INFO, DEBUG, ERROR, WARN)
- Metadata support for better debugging

#### `utils/errors.ts`

- Custom error classes for different failure scenarios
- Better error categorization and handling

#### `utils/responses.ts`

- HTTP response helpers for API Gateway
- Consistent response formatting
- CORS headers management

## Configuration Management

The `config.ts` file centralizes all environment variable access and provides:

- Type-safe configuration access
- Environment variable validation on startup
- Default values where appropriate
- Clear documentation of all required variables

## Migration Benefits

### Before (Monolithic)

- Single 1,300+ line file
- Mixed responsibilities
- Difficult to test
- Hard to reuse logic
- Complex debugging

### After (Service-Oriented)

- Multiple focused modules (50-200 lines each)
- Clear separation of concerns
- Easy to unit test
- Reusable services
- Structured error handling
- Better debugging with structured logging

## Usage Example

The new `chatHandler/index.ts` demonstrates the clean orchestration pattern:

```typescript
// 1. Authenticate user
const { userId, userMessage } = await validateRequest(event);

// 2. Fetch context
const context = await getContextForUser(userId);

// 3. Generate AI response
const { response, toolCall } = await invokeBedrock(
  buildPrompt(context, userMessage)
);

// 4. Execute tools if needed
if (toolCall) {
  finalResponse = await executeTool(userId, toolCall.input);
}

// 5. Save conversation
await saveChatMessage(userId, 'assistant', finalResponse);
```

## Deployment

The refactored code is deployed via AWS CDK with the following Lambda function:

```typescript
const chatHandler = new NodejsFunction(this, 'ChatHandler', {
  entry: path.join(lambdaBaseDir, '../src/lambda/chatHandler/index.ts'),
  // ... configuration
});
```

The API endpoint is available at: `POST /chat`

## Future Enhancements

This architecture makes the following future features much easier to implement:

1. **Scheduled Tasks**: Reuse database and AI services for automated goal tracking
2. **Webhooks**: Import services for external integrations
3. **Batch Processing**: Reuse business logic for bulk operations
4. **Testing**: Mock individual services for comprehensive testing
5. **Monitoring**: Structured logging enables better observability

## Error Handling

The new architecture provides consistent error handling across all services:

- `ValidationError`: Input validation failures (400)
- `AuthError`: Authentication failures (401)
- `NotFoundError`: Resource not found (404)
- `DatabaseError`: Database operation failures (500)
- `BedrockError`: AI service failures (503)

Each error type maps to appropriate HTTP status codes and user-friendly messages.
