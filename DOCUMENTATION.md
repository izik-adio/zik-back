# Zik Backend Documentation (2025)

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [API Reference](#api-reference)
4. [Data Models](#data-models)
5. [Core Services](#core-services)
6. [Infrastructure & Deployment](#infrastructure--deployment)
7. [Environment & Configuration](#environment--configuration)
8. [Testing](#testing)
9. [Utilities](#utilities)
10. [Development & Contribution](#development--contribution)

---

## 1. Overview

The Zik backend is a modern, serverless, event-driven system built on AWS. It powers the Zik AI life companion app, enabling users to manage long-term goals (Epic Quests), daily tasks, and recurring habits through conversational AI and automation. The backend is designed for scalability, maintainability, and testability, using a clean architecture and AWS best practices.

---

## 2. Architecture

```
zik-back/
├── src/                          # Main source code (clean architecture)
│   ├── lambda/                   # Modern Lambda orchestrators
│   │   ├── chatHandler/          # Conversational AI entrypoint
│   │   │   ├── index.ts
│   │   │   └── __tests__/
│   │   │       └── index.test.ts
│   │   └── recurringTaskGenerator/
│   │       └── index.ts
│   ├── services/                 # Core business and infrastructure services
│   │   ├── auth/                 # (Reserved for future: modular auth logic)
│   │   ├── authService.ts        # JWT validation and user identity
│   │   ├── bedrockService.ts     # Amazon Bedrock AI integration
│   │   ├── toolExecutor.ts       # AI tool execution coordination
│   │   └── database/             # DynamoDB access modules (context aggregation in chatMessages.ts)
│   │       ├── client.ts
│   │       ├── goals.ts
│   │       ├── tasks.ts
│   │       ├── chatMessages.ts
│   │       ├── recurrenceRules.ts
│   │       └── __tests__/
│   ├── utils/                    # Logging, error, and response helpers
│   ├── types/                    # Shared TypeScript interfaces
│   └── config.ts                 # Centralized environment config
├── lambda/                       # Legacy Lambda handlers (for migration/testing)
├── lib/                          # AWS CDK infrastructure code
├── bin/                          # CDK app entry point
├── test/                         # Integration and E2E tests
├── dist/                         # TypeScript build output
├── cdk.out/                      # CDK build artifacts
├── auth-test.js, chat-test.js, token-utils.js, token.json, token.txt # Developer/test utilities (not core)
├── package.json, tsconfig.json, jest.config.js, cdk.json, etc.
```

- **src/lambda/**: Modern Lambda orchestrators (chat, recurring tasks)
- **src/services/**: Business logic, database, AI, and tool execution
- **src/types/**: Shared data models and contracts
- **src/utils/**: Logging, error, and response helpers
- **lambda/**: Legacy Lambda handlers (for migration/testing)
- **lib/**, **bin/**: AWS CDK infrastructure-as-code
- **test/**: Integration and E2E tests
- **auth-test.js**, **chat-test.js**, **token-utils.js**: Developer/test utilities (not part of production system)

---

## 3. API Reference

### Authentication

All endpoints require a valid JWT access token (AWS Cognito) in the `Authorization` header. All operations are strictly scoped to the authenticated user (no cross-user access).

```
Authorization: Bearer <JWT_ACCESS_TOKEN>
```

### 3.1. Chat API (Conversational AI)

- **POST /chat**
  - Conversational endpoint for interacting with Zik AI.
  - Request body: `{ "message": "<user message>" }`
  - Returns: `{ response: <AI response>, requestId, timestamp }`
  - Handles context gathering, AI prompt, tool execution, and chat history.

### 3.2. Epic Quest (Goal) Management

- **GET /goals**: List all active goals for the authenticated user.
- **POST /goals**: Create a new goal. `{ "goalName": "..." }`
- **PUT /goals/{goalId}**: Update a goal. `{ ...fields }`
- **DELETE /goals/{goalId}**: Delete a goal.

### 3.3. Daily Task Management

- **GET /tasks**: List today's tasks (or by date) for the user. Supports optional `date` query param (e.g., `/tasks?date=YYYY-MM-DD`).
- **POST /tasks**: Create a new task. `{ "taskName": "...", "dueDate": "YYYY-MM-DD", ... }`
- **PUT /tasks/{taskId}**: Update a task. `{ ...fields }`
- **DELETE /tasks/{taskId}**: Delete a task.

> **Sample request/response payloads for all endpoints are available in `API-REFRACTORING-NOTES.md`.**

### 3.4. Recurrence Rules (Proactive Engine)

- Managed internally; not exposed as public API. Used by scheduled Lambda to generate daily tasks.

---

## 4. Data Models

All types are defined in `src/types/index.ts`.

- **Note:**
  - The `Task` model uses `taskName` (not `title`), and `Goal` uses `goalName`.
  - The `RecurrenceRule` model supports `daysOfWeek` for weekly rules.
  - The `ToolInput` interface (for AI tool calls) is also defined in `src/types/index.ts`.

### UserProfile

```ts
interface UserProfile {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  preferences: any;
  createdAt: string;
  lastLoginAt?: string;
}
```

### Goal (Epic Quest)

```ts
interface Goal {
  userId: string;
  goalId: string;
  goalName: string;
  description?: string;
  targetDate?: string;
  category?: string;
  status: 'active' | 'completed' | 'paused';
  createdAt: string;
  updatedAt: string;
}
```

### Task (Daily Quest)

```ts
interface Task {
  userId: string;
  taskId: string;
  taskName: string;
  description?: string;
  dueDate: string;
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'in-progress' | 'completed';
  goalId?: string;
  createdAt: string;
  updatedAt: string;
}
```

### RecurrenceRule

```ts
interface RecurrenceRule {
  userId: string;
  recurrenceRuleId: string;
  goalId?: string;
  title: string;
  description?: string;
  priority?: 'low' | 'medium' | 'high';
  status: 'active' | 'paused';
  frequency: 'daily' | 'weekdays' | 'weekends' | 'weekly';
  daysOfWeek?: number[];
  createdAt: string;
  updatedAt: string;
}
```

### ChatMessage

```ts
interface ChatMessage {
  userId: string;
  timestamp: string;
  messageId: string;
  role: 'user' | 'assistant';
  content: string;
}
```

### ContextData (for AI)

```ts
interface ContextData {
  userProfile: UserProfile | null;
  activeGoals: Goal[];
  todayTasks: Task[];
  chatHistory: ChatMessage[];
}
```

---

## 4a. Database Schema Details

The Zik backend uses DynamoDB for all persistent storage. Below are the details of each table, including partition/sort keys and indexes, as defined in the infrastructure code (`lib/zik-backend-stack.ts`).

### Goals Table

- **Table Name:** `GOALS_TABLE_NAME`
- **Partition Key:** `userId` (string)
- **Sort Key:** `goalId` (string)
- **Billing Mode:** PAY_PER_REQUEST
- **Description:** Stores all Epic Quests (long-term goals) for each user. Each goal is uniquely identified by the combination of `userId` and `goalId`.

### Tasks Table

- **Table Name:** `TASKS_TABLE_NAME`
- **Partition Key:** `userId` (string)
- **Sort Key:** `taskId` (string)
- **Billing Mode:** PAY_PER_REQUEST
- **Description:** Stores all Daily Quests (tasks) for each user. Each task is uniquely identified by the combination of `userId` and `taskId`.
- **Global Secondary Index:**
  - **Index Name:** `userId-dueDate-index`
  - **Partition Key:** `userId` (string)
  - **Sort Key:** `dueDate` (string)
  - **Purpose:** Enables efficient queries for all tasks for a user on a specific date.

### Users Table

- **Table Name:** `USERS_TABLE_NAME`
- **Partition Key:** `userId` (string)
- **Billing Mode:** PAY_PER_REQUEST
- **Description:** Stores user profile information. Each user is uniquely identified by `userId`.

### Recurrence Rules Table

- **Table Name:** `RECURRENCE_RULES_TABLE_NAME`
- **Partition Key:** `userId` (string)
- **Sort Key:** `recurrenceRuleId` (string)
- **Billing Mode:** PAY_PER_REQUEST
- **Description:** Stores recurrence rules for automatically generating daily tasks. Each rule is uniquely identified by the combination of `userId` and `recurrenceRuleId`.

### Chat Messages Table

- **Table Name:** `CHAT_MESSAGES_TABLE_NAME`
- **Partition Key:** `userId` (string)
- **Sort Key:** `timestamp` (string, ISO8601)
- **Billing Mode:** PAY_PER_REQUEST
- **Description:** Stores all chat messages for each user, ordered by timestamp.

---

**Attribute Types:**

- All partition and sort keys are strings.
- All tables use on-demand (PAY_PER_REQUEST) billing for scalability.

**Relationships:**

- All tables are user-scoped: every item is partitioned by `userId`.
- Tasks and goals are linked by `goalId` (optional on Task).
- Recurrence rules can reference a `goalId` (optional).

**Indexes:**

- The only explicit GSI is on the Tasks table for querying by `dueDate`.

For more details, see the infrastructure code in `lib/zik-backend-stack.ts`.

---

## 4b. AI Capabilities and Tooling

The Zik backend leverages Amazon Bedrock (Claude 3 Haiku) to provide an intelligent, conversational AI life coach. The AI is guided by a system prompt and can call specific tools to interact with user data. Below are the details of the AI's capabilities and the tools it can use:

### System Prompt and Philosophy

- The AI acts as an empathetic, encouraging, and intelligent life coach.
- It helps users define, manage, and achieve goals by breaking them into "Epic Quests" (long-term goals) and "Daily Quests" (tasks).
- The AI is instructed to:
  - Use tools to answer user questions or perform actions (never guess or invent data)
  - Celebrate user achievements and encourage progress
  - Keep responses concise and mobile-friendly
  - Never mention tools or its AI nature in responses

### Available Tools

#### 1. `get_quests` (Read Tool)

- **Purpose:** Retrieve a user's quests (either epic/goals or daily/tasks)
- **When Used:**
  - User asks about their goals, tasks, or progress (e.g., "What are my goals?", "Do I have tasks today?")
- **Parameters:**
  - `questType` (required): `'epic'` (for goals) or `'daily'` (for tasks)
  - `questId` (optional): Filter by specific quest ID
  - `epicId` (optional): Filter daily quests by parent goal
  - `dueDate` (optional): Filter daily quests by date (YYYY-MM-DD)
  - `status` (optional): Filter by quest status (`pending`, `in-progress`, `completed`, `active`, `paused`)

#### 2. `modify_quest` (Write Tool)

- **Purpose:** Create, update, or delete a user's quest (goal or task)
- **When Used:**
  - User asks to add, change, remove, complete, or schedule a quest
- **Parameters:**
  - `operation` (required): `'create'`, `'update'`, or `'delete'`
  - `questType` (required): `'epic'`, `'daily'`, or `'recurrence'`
  - `title` (required for create): Title of the quest
  - `questId` (required for update/delete): ID of the quest
  - `epicId` (optional): Parent goal for a daily quest
  - `dueDate` (optional): Date for a daily quest
  - `recurrenceRule` (optional): Recurrence pattern (e.g., 'daily', 'weekdays')
  - `frequency`, `daysOfWeek` (optional): For recurrence rules
  - `updateFields` (required for update): Fields to update (object)

### Tool Usage Logic

- The AI always calls the appropriate tool before responding to the user.
- For read requests, it uses `get_quests` with the right filters.
- For create/update/delete, it uses `modify_quest` with the correct parameters.
- The AI never fabricates data—if it doesn't know, it uses a tool or says so.

### Example Tool Call (AI Internal)

```json
{
  "tool": "get_quests",
  "input": {
    "questType": "daily",
    "dueDate": "2025-06-26"
  }
}
```

### Example User-Facing Response

> "You have 3 tasks scheduled for today. Let me know if you want to add or update any!"

---

For more, see the system prompt and tool definitions in `src/services/bedrockService.ts` and the tool execution logic in `src/services/toolExecutor.ts`.

---

## 5. Core Services

### 5.1. Authentication (`src/services/authService.ts`)

- Validates JWT tokens using AWS Cognito.
- Extracts userId from the token's `sub` claim.
- Throws `AuthError` or `ValidationError` on failure.

### 5.2. Bedrock AI Service (`src/services/bedrockService.ts`)

- Integrates with Amazon Bedrock (Claude 3 Haiku).
- Builds prompts from user context and message.
- Supports AI tool calls: `get_quests` (read), `modify_quest` (write).
- Handles tool call parameter validation and error handling.

### 5.3. Tool Executor (`src/services/toolExecutor.ts`)

- Executes AI tool calls for quest management.
- Supports both read and write operations for all quest types (goals, tasks, recurrence rules).
- Implements guardrails to prevent invalid or unsafe tool calls.

### 5.4. Database Services (`src/services/database/`)

- **client.ts**: Centralized DynamoDB DocumentClient.
- **goals.ts**: CRUD for goals.
- **tasks.ts**: CRUD for tasks.
- **chatMessages.ts**: Chat history, user profile, and context aggregation (`getContextForUser` fetches all user context in parallel).
- **recurrenceRules.ts**: CRUD for recurrence rules.

---

## 6. Infrastructure & Deployment

- **AWS CDK** (`lib/zik-backend-stack.ts`, `bin/zik-backend.ts`):
  - Defines all infrastructure as code (API Gateway, Cognito, DynamoDB, Lambda, EventBridge, IAM, etc.)
  - Deploy with `cdk deploy`.
- **API Gateway**: HTTP API for all endpoints.
- **Cognito**: User authentication and JWT issuance.
- **DynamoDB**: Tables for users, goals, tasks, chat messages, recurrence rules.
- **Lambda**: All business logic and orchestration.
- **EventBridge**: Schedules recurring task generation.

---

## 7. Environment & Configuration

- All environment variables are managed in `.env` and validated in `src/config.ts` on startup.
- Required variables:
  - `API_ENDPOINT`, `USER_POOL_ID`, `USER_POOL_CLIENT_ID`, `AWS_REGION`, `bedrockModelId`, etc.
  - DynamoDB table names: `CHAT_MESSAGES_TABLE_NAME`, `GOALS_TABLE_NAME`, `TASKS_TABLE_NAME`, `USERS_TABLE_NAME`, `RECURRENCE_RULES_TABLE_NAME`
  - Indexes: `USER_ID_DUE_DATE_INDEX`
- See `.env` and `.env.test` for examples.

---

## 8. Testing

- **Unit Tests**: Located in `src/services/**/__tests__` and `src/utils/__tests__`.
- **Integration Tests**: `src/lambda/chatHandler/__tests__/index.test.ts`, etc.
- **E2E Tests**: In `test/` directory.
- **Test Runner**: Jest (`jest.config.js`).
- **Coverage**: Run `npm run test:coverage`.
- **All API responses include a `requestId` for debugging.**

---

## 9. Utilities

- **Logger** (`src/utils/logger.ts`): Structured, safe logging with metadata (JSON format for easy CloudWatch querying).
- **Error Classes** (`src/utils/errors.ts`): Custom error types for validation, auth, database, Bedrock, not found. All error types map to appropriate HTTP status codes and user-friendly messages.
- **Response Helpers** (`src/utils/responses.ts`): Standardized API Gateway responses with CORS and error formatting.

---

## 10. Development & Contribution

- **Build**: `npm run build` (TypeScript)
- **Watch**: `npm run watch`
- **Test**: `npm test` (all), `npm run test:unit`, `npm run test:integration`, etc.
- **Deploy**: `cdk deploy`
- **Environment**: Node.js 18+, AWS credentials, `.env` file
- **Code Style**: Prettier (`.prettierrc`)
- **Extensibility**: Add new Lambda handlers in `src/lambda/`, new services in `src/services/`, new types in `src/types/`
- **Type Safety**: All shared types/interfaces are centralized in `src/types/index.ts` for consistency across the application.
- **Developer Utilities**: Test scripts and token helpers are in the project root.
