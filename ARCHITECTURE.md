# Zik Backend - Refactored Architecture

## Overview

This document describes the refactored architecture of the Zik backend, transformed from a monolithic 1,300+ line Lambda function into a clean, service-oriented architecture following software engineering best practices.

## Architecture Blueprint

```
src/
├── lambda/
│   └── chatHandler/
│       └── index.ts        # Lean orchestrator handler (now ~200 lines)
│
├── services/
│   ├── authService.ts      # JWT validation and user identity logic
│   ├── bedrockService.ts   # Bedrock client setup, prompt building, and API calls
│   ├── toolExecutor.ts     # Tool execution coordination
│   └── database/
│       ├── client.ts       # Centralized DynamoDB Document Client
│       ├── goals.ts        # Goals table CRUD operations
│       ├── tasks.ts        # Tasks table CRUD operations
│       └── chatMessages.ts # Chat messages table CRUD + context aggregation
│
├── utils/
│   ├── logger.ts           # Structured logging utility
│   ├── errors.ts           # Custom error classes
│   └── responses.ts        # HTTP response helper functions
│
├── types/
│   └── index.ts            # Shared TypeScript interfaces
│
└── config.ts               # Centralized environment variable management
```

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
