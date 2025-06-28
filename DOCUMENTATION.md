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
10. [Known Issues & Troubleshooting](#known-issues--troubleshooting)
11. [Development & Contribution](#development--contribution)

---

## 1. Overview

The Zik backend is a modern, serverless, event-driven system built on AWS. It powers the Zik AI life companion app, enabling users to manage long-term goals (Epic Quests), daily tasks, and recurring habits through conversational AI and automation. 

**Key Features:**
- **Epic Quest & Roadmap System**: AI-powered goal breakdown into achievable milestones
- **Just-in-Time Task Generation**: Daily quests created exactly when needed
- **Intelligent Milestone Progression**: Automatic advancement through goal roadmaps
- **Conversational AI Interface**: Natural language interaction with Bedrock Claude
- **Chat History Management**: Persistent conversation storage with cleanup capabilities
- **User Profile System**: Comprehensive user management with onboarding flow

**Current Status (2025-06-28):**
- ✅ Core API endpoints fully operational
- ✅ Chat history management recently fixed and working
- ✅ Profile management system implemented
- ⚠️ Chat AI endpoint requires Bedrock model access setup
- ✅ All database operations and CRUD functionality working
- ✅ Comprehensive test utilities available

The backend is designed for scalability, maintainability, and testability, using a clean architecture and AWS best practices.

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
│   │   ├── recurringTaskGenerator.ts # Scheduled task generation
│   │   ├── roadmapGenerator/     # AI-powered roadmap generation
│   │   │   └── index.ts
│   │   ├── milestoneSaver/       # Milestone persistence
│   │   │   └── index.ts
│   │   └── dailyQuestGenerator/  # Just-in-time task creation
│   │       └── index.ts
│   ├── services/                 # Core business and infrastructure services
│   │   ├── auth/                 # (Reserved for future: modular auth logic)
│   │   ├── authService.ts        # JWT validation and user identity
│   │   ├── bedrockService.ts     # Amazon Bedrock AI integration
│   │   ├── toolExecutor.ts       # AI tool execution coordination
│   │   ├── roadmapService.ts     # Planner & Coach AI logic
│   │   ├── stepFunctionService.ts # Step Function orchestration
│   │   └── database/             # DynamoDB access modules
│   │       ├── client.ts
│   │       ├── goals.ts
│   │       ├── tasks.ts
│   │       ├── milestones.ts     # Milestone operations
│   │       ├── chatMessages.ts   # Chat history & context aggregation
│   │       ├── users.ts          # User profile management
│   │       ├── recurrenceRules.ts
│   │       └── __tests__/
│   ├── utils/                    # Logging, error, and response helpers
│   ├── types/                    # Shared TypeScript interfaces
│   └── config.ts                 # Centralized environment config
├── lambda/                       # Legacy Lambda handlers (API route handlers)
│   ├── manageChatHistory.ts      # Chat history CRUD operations
│   ├── manageGoals.ts           # Goal management endpoints
│   ├── manageProfile.ts         # User profile endpoints
│   ├── manageQuests.ts          # Task management endpoints
│   ├── startRoadmapGeneration.ts # Roadmap workflow trigger
│   ├── chatHistoryCleanup.ts    # Cleanup utilities
│   └── __tests__/               # Integration tests
├── lib/                          # AWS CDK infrastructure code
├── bin/                          # CDK app entry point
├── test/                         # Integration and E2E tests
├── dist/                         # TypeScript build output
├── cdk.out/                      # CDK build artifacts
├── Developer/Test Utilities:     # Testing and debugging tools
│   ├── auth-test.js              # Authentication testing
│   ├── chat-test.js              # Chat endpoint testing
│   ├── chat-history-test.js      # Chat history testing
│   ├── profile-test.js           # Profile management testing
│   ├── debug-api.js              # General API debugging
│   ├── check-token.js            # JWT validation utility
│   ├── token.json, token.txt     # Token storage
│   └── Various debug-*.js files # Specific debugging utilities
├── package.json, tsconfig.json, jest.config.js, cdk.json, etc.
```

- **src/lambda/**: Modern Lambda orchestrators (chat, recurring tasks, AI workflows)
- **src/services/**: Business logic, database, AI, and tool execution
- **src/types/**: Shared data models and contracts
- **src/utils/**: Logging, error, and response helpers
- **lambda/**: API route handlers (goals, tasks, profile, chat history management)
- **lib/**, **bin/**: AWS CDK infrastructure-as-code
- **test/**: Integration and E2E tests
- **Root-level .js files**: Developer/test utilities for manual API testing and debugging

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

### 3.2. Chat History Management

- **GET /chat-history**: Retrieve all of user's chat message history (max 10 messages).
  - No parameters needed - simplified API
  - Returns: `{ messages: ChatMessage[], count: number, timestamp }`
- **DELETE /chat-history**: Clear all chat history.
  - No parameters needed - clears everything
  - Returns: `{ deletedMessages: number, message: string, timestamp }`

### 3.3. Epic Quest (Goal) Management

- **GET /goals**: List all active goals for the authenticated user.
- **POST /goals**: Create a new goal. `{ "goalName": "..." }`
  - **Note**: Complex goals automatically trigger roadmap generation via Step Functions
- **PUT /goals/{goalId}**: Update a goal. `{ ...fields }`
- **DELETE /goals/{goalId}**: Delete a goal.
- **GET /goals/{goalId}/milestones**: Get AI-generated milestones for an Epic Quest
  - Returns ordered list of milestones with status: `locked`, `active`, or `completed`

### 3.4. Daily Task Management

- **GET /tasks**: List today's tasks (or by date) for the user. Supports optional `date` query param (e.g., `/tasks?date=YYYY-MM-DD`).
  - **Note**: Includes milestone-linked tasks generated by the Coach AI
- **POST /tasks**: Create a new task. `{ "taskName": "...", "dueDate": "YYYY-MM-DD", ... }`
- **PUT /tasks/{taskId}**: Update a task. `{ ...fields }`
  - **Note**: Marking tasks as `completed` triggers automatic milestone progression
- **DELETE /tasks/{taskId}**: Delete a task.

### 3.5. Profile Management

- **GET /profile**: Retrieve current user's profile information.
- **POST /profile**: Create/initialize user profile. `{ firstName, lastName, preferences, ... }`
- **PUT /profile**: Update profile information. `{ ...fields }`
- **PUT /profile/onboarding/complete**: Mark user onboarding as completed.

### 3.6. Recurrence Rules (Proactive Engine)

- Managed internally; not exposed as public API. Used by scheduled Lambda to generate daily tasks.

> **Sample request/response payloads for all endpoints are available in `API-REFRACTORING-NOTES.md` and test files.**

---

## 4. Data Models

All types are defined in `src/types/index.ts`.

- **Note:**
  - The `Task` model uses `taskName` (not `title`), and `Goal` uses `goalName`.
  - The `RecurrenceRule` model supports `daysOfWeek` for weekly rules.
  - The `ToolInput` interface (for AI tool calls) is also defined in `src/types/index.ts`.

### UserProfile

```ts
interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  notifications: {
    email: boolean;
    push: boolean;
    dailyReminders: boolean;
    weeklyDigest: boolean;
  };
  timezone: string;
  language: string;
  questCategories: string[];
  privacySettings: {
    shareProgress: boolean;
    publicProfile: boolean;
  };
}

interface UserProfile {
  userId: string;
  username: string; // Unique username across the platform
  email: string; // Unique email across the platform
  firstName: string;
  lastName: string;
  displayName?: string;
  avatarUrl?: string;
  preferences: UserPreferences;
  onboardingCompleted: boolean;
  createdAt: string;
  lastLoginAt?: string;
  updatedAt: string;
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
  roadmapStatus?: 'none' | 'generating' | 'ready'; // NEW: Roadmap generation status
  createdAt: string;
  updatedAt: string;
}
```

### Milestone (Roadmap Step)

```ts
interface Milestone {
  epicId: string;        // The goalId of the parent Epic Quest (Partition Key)
  sequence: number;      // Order in the roadmap (Sort Key)
  milestoneId: string;   // Unique ID for the milestone
  userId: string;        // The ID of the user who owns it
  title: string;         // e.g., "Week 1: Master Basic Chords"
  description?: string;  // e.g., "Focus on G, C, and D chords and smooth transitions"
  status: 'locked' | 'active' | 'completed'; // Progress tracking
  durationInDays: number; // Estimated duration for this milestone
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
  goalId?: string;      // Optional link to parent Epic Quest
  milestoneId?: string; // NEW: Optional link to parent Milestone
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

### Milestones Table

- **Table Name:** `MILESTONES_TABLE_NAME`
- **Partition Key:** `epicId` (string) - The goalId of the parent Epic Quest
- **Sort Key:** `sequence` (number) - Order in the roadmap (1, 2, 3...)
- **Billing Mode:** PAY_PER_REQUEST
- **Description:** Stores AI-generated milestone roadmaps for Epic Quests. Designed for efficient retrieval of entire roadmaps via single query operation.

### Users Table

- **Table Name:** `USERS_TABLE_NAME`
- **Partition Key:** `userId` (string)
- **Billing Mode:** PAY_PER_REQUEST
- **Description:** Stores user profile information with enhanced structure including preferences, onboarding status, and unique constraints.
- **Global Secondary Indexes:**
  - **username-index:** Partition Key: `username` (string) - For username uniqueness validation
  - **email-index:** Partition Key: `email` (string) - For email uniqueness validation
- **Unique Constraints:** Username and email must be unique across all users

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
- **TTL Attribute:** `ttl` (automatic cleanup after 30 days)
- **Description:** Stores all chat messages for each user, ordered by timestamp. Includes automatic cleanup via TTL and manual cleanup endpoints.

---

**Attribute Types:**

- All partition and sort keys are strings.
- All tables use on-demand (PAY_PER_REQUEST) billing for scalability.

**Relationships:**

- All tables are user-scoped: every item is partitioned by `userId`.
- Tasks and goals are linked by `goalId` (optional on Task).
- Milestones are linked to goals via `epicId` (which is the `goalId`).
- Tasks can be linked to milestones via `milestoneId` (optional on Task).
- Milestone progression: locked → active → completed, with automatic task generation.

---

## 4b. Epic Quest & Roadmap System

### Overview

The Epic Quest & Roadmap System is an AI-powered feature that automatically breaks down complex, long-term goals into achievable milestones and generates daily tasks just-in-time as users progress.

### Components

#### 1. Planner AI (Roadmap Generation)
- **Purpose**: Analyzes Epic Quests and creates 3-7 logical milestones
- **Technology**: Amazon Bedrock (Claude 3 Haiku)
- **Trigger**: Automatically triggered when complex goals are created
- **Processing**: Asynchronous via AWS Step Functions

#### 2. Coach AI (Daily Quest Generation)  
- **Purpose**: Creates specific, actionable daily tasks for active milestones
- **Technology**: Amazon Bedrock (Claude 3 Haiku)
- **Trigger**: When milestones become active or when milestone progression occurs
- **Processing**: Just-in-time generation

#### 3. Milestone Progression Engine
- **Purpose**: Manages progression through roadmap milestones
- **Trigger**: When all tasks in a milestone are completed
- **Actions**: 
  - Mark current milestone as completed
  - Activate next milestone
  - Generate new daily tasks for next milestone
  - Mark Epic Quest as completed when all milestones done

### Workflow

1. **Epic Quest Creation**
   ```
   User creates goal → AI detects complexity → Roadmap generation triggered
   ```

2. **Roadmap Generation** (Step Function)
   ```
   Planner AI → Generate milestones → Save to database → Generate initial tasks
   ```

3. **Daily Quest Management**
   ```
   Active milestone → Coach AI → Daily tasks → User completion → Progression check
   ```

4. **Milestone Progression**
   ```
   All tasks completed → Milestone completed → Next milestone activated → New tasks generated
   ```

### Status Management

**Goal roadmapStatus:**
- `"none"`: Default state, no roadmap needed
- `"generating"`: AI is creating the roadmap (30-60 seconds)
- `"ready"`: Roadmap complete, milestones available

**Milestone status:**
- `"locked"`: Not yet available (previous milestones must be completed)
- `"active"`: Currently in progress (has daily tasks)
- `"completed"`: All tasks finished, progression ready

---
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

**Epic Quest Creation Enhancement:**
- When creating complex Epic Quests, the system automatically triggers roadmap generation
- The AI responds with confirmation and roadmap generation status
- Background Step Function workflow creates personalized milestones and initial daily tasks

### AI-Powered Features

#### Roadmap Generation (Planner AI)
- **Trigger**: Complex Epic Quest creation
- **Process**: Bedrock Claude analyzes goal and creates 3-7 logical milestones
- **Output**: Structured roadmap with realistic timeframes and descriptions
- **Status**: Tracked via `roadmapStatus` field on goals

#### Daily Quest Generation (Coach AI)
- **Trigger**: Milestone activation or progression
- **Process**: Bedrock Claude creates specific, actionable daily tasks
- **Output**: Time-bounded tasks (30-90 minutes each) that build toward milestone completion
- **Timing**: Just-in-time generation when milestones become active

#### Milestone Progression
- **Trigger**: Task completion that results in milestone completion
- **Process**: Automatic status updates and next milestone activation
- **Intelligence**: System detects when all milestone tasks are complete
- **Action**: Generates new daily quests for next milestone automatically

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
- **Enhanced**: Triggers milestone completion checking when tasks are marked as completed.

### 5.4. Roadmap Service (`src/services/roadmapService.ts`)

- **Planner AI**: Generates personalized roadmaps for Epic Quests using Bedrock Claude
- **Coach AI**: Creates daily tasks for specific milestones
- Constructs optimized prompts for both AI personalities
- Handles JSON parsing and validation of AI responses
- Manages milestone sequencing and task distribution

### 5.5. Step Function Service (`src/services/stepFunctionService.ts`)

- Orchestrates complex workflows via AWS Step Functions
- **Roadmap Generation Workflow**: Coordinates Planner AI → Milestone Saver → Coach AI
- **Direct Invocation**: Triggers daily quest generation for milestone progression
- Provides async, resilient processing for AI-powered features

### 5.6. Database Services (`src/services/database/`)

- **client.ts**: Centralized DynamoDB DocumentClient.
- **goals.ts**: CRUD for Epic Quests with roadmap status management.
- **tasks.ts**: CRUD for tasks with milestone linking and progression logic.
- **milestones.ts**: CRUD for roadmap milestones with sequence-based operations.
- **chatMessages.ts**: Chat history, user profile, and context aggregation (`getContextForUser` fetches all user context in parallel).
- **recurrenceRules.ts**: CRUD for recurrence rules.

---

## 6. Infrastructure & Deployment

- **AWS CDK** (`lib/zik-backend-stack.ts`, `bin/zik-backend.ts`):
  - Defines all infrastructure as code (API Gateway, Cognito, DynamoDB, Lambda, Step Functions, IAM, etc.)
  - Deploy with `cdk deploy`.
- **API Gateway**: HTTP API for all endpoints.
- **Cognito**: User authentication and JWT issuance.
- **DynamoDB**: Tables for users, goals, tasks, milestones, chat messages, recurrence rules.
- **Lambda**: All business logic and orchestration.
- **Step Functions**: Workflow orchestration for roadmap generation.
- **EventBridge**: Schedules recurring task generation.
- **Bedrock**: AI services for roadmap and task generation.

### Key Infrastructure Components

#### Step Functions
- **RoadmapGeneratorWorkflow**: Orchestrates roadmap creation
  - `RoadmapGeneratorLambda`: Planner AI processing
  - `MilestoneSaverLambda`: Milestone persistence
  - `DailyQuestGeneratorLambda`: Initial task generation

#### Lambda Functions
- **ChatHandler**: Main conversational interface
- **ManageGoalsHandler**: Goal and milestone management
- **ManageQuestsHandler**: Task management with milestone progression
- **RecurringTaskGenerator**: Scheduled task creation

---

## 7. Environment & Configuration

- All environment variables are managed in `.env` and validated in `src/config.ts` on startup.
- Required variables:
  - `API_ENDPOINT`, `USER_POOL_ID`, `USER_POOL_CLIENT_ID`, `AWS_REGION`, `bedrockModelId`, etc.
  - DynamoDB table names: `CHAT_MESSAGES_TABLE_NAME`, `GOALS_TABLE_NAME`, `TASKS_TABLE_NAME`, `MILESTONES_TABLE_NAME`, `USERS_TABLE_NAME`, `RECURRENCE_RULES_TABLE_NAME`
  - Step Function ARNs: `ROADMAP_GENERATOR_WORKFLOW_ARN`, `DAILY_QUEST_GENERATOR_LAMBDA_ARN`
  - Indexes: `USER_ID_DUE_DATE_INDEX`
- See `.env` and `.env.test` for examples.

### Deployment Information

**Current Live Environment:**
- **API Endpoint**: `https://h5k4oat3hi.execute-api.us-east-1.amazonaws.com/`
- **AWS Region**: `us-east-1`
- **Deployment Status**: Fully operational with Epic Quest & Roadmap features enabled

**Deployment Command:**
```bash
npx cdk deploy --require-approval never
```

**Build Command:**
```bash
npm run build
```

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

## 10. Known Issues & Troubleshooting

### 10.1. Chat Endpoint Issues

**Issue**: Chat endpoint returns 503 "AI service temporarily unavailable" errors.

**Root Cause**: AWS account may not have access to the Claude 3 Haiku model in Amazon Bedrock.

**Solution**:
1. **Enable Model Access in Amazon Bedrock Console**:
   - Go to AWS Bedrock Console → Model Access
   - Request access to "Claude 3 Haiku" model (`anthropic.claude-3-haiku-20240307-v1:0`)
   - Wait for approval (usually instant for Haiku)

2. **Alternative**: Change to a different model that might already be enabled in `src/config.ts`:
   ```typescript
   bedrockModelId: 'amazon.titan-text-express-v1',
   ```

**Status**: ⚠️ **KNOWN ISSUE** - Model access needs to be enabled per AWS account.

### 10.2. Chat History DELETE Fixed

**Issue**: Chat history DELETE endpoint was returning 500 "Database operation failed" errors.

**Root Cause**: JavaScript falsy evaluation bug when `maxMessages` parameter was 0.

**Solution**: Fixed in `src/services/database/chatMessages.ts` - changed condition from `maxMessages || config.maxChatHistoryPerUser` to `maxMessages !== undefined ? maxMessages : config.maxChatHistoryPerUser`.

**Status**: ✅ **RESOLVED** - All DELETE operations now work correctly.

### 10.3. Environment Variables

**Required Variables**: The following environment variables must be set:
- `USER_POOL_ID`
- `USER_POOL_CLIENT_ID`
- All DynamoDB table names (auto-generated by CDK)
- Step Function ARNs (auto-generated by CDK)

**Validation**: Environment variables are validated on startup in `src/config.ts`.

### 10.4. Token Expiration

**Issue**: JWT tokens expire after 1 hour.

**Solution**: Use the provided auth test utilities:
```bash
node auth-test.js signin  # Get fresh token
```

**Test Files**: `auth-test.js`, `chat-test.js`, `chat-history-test.js` provide testing utilities.

---

## 11. Development & Contribution

- **Build**: `npm run build` (TypeScript)
- **Watch**: `npm run watch`
- **Test**: `npm test` (all), `npm run test:unit`, `npm run test:integration`, etc.
- **Deploy**: `npx cdk deploy --require-approval never`
- **Environment**: Node.js 18+, AWS credentials, `.env` file
- **Code Style**: Prettier (`.prettierrc`)
- **Extensibility**: Add new Lambda handlers in `src/lambda/`, new services in `src/services/`, new types in `src/types/`
- **Type Safety**: All shared types/interfaces are centralized in `src/types/index.ts` for consistency across the application.

### 11.1. Test Files & Utilities

**Development Test Files** (located in project root):
- `auth-test.js` - Authentication and token management testing
- `chat-test.js` - Comprehensive chat endpoint testing
- `chat-history-test.js` - Chat history API testing
- `profile-test.js` - Profile management testing
- `debug-api.js` - General API debugging
- `check-token.js` - JWT token validation utility

**Test Commands**:
```bash
# Run specific test suites
npm run test:unit           # Unit tests
npm run test:integration    # Integration tests
npm run test:services       # Service layer tests
npm run test:utils          # Utility tests
npm run test:coverage       # Coverage report

# Manual API testing
node auth-test.js signin    # Get fresh auth token
node chat-test.js           # Test chat functionality
node chat-history-test.js   # Test chat history
```

### 11.2. Recent Updates & Fixes

**2025-06-28**: 
- ✅ Fixed chat history DELETE endpoint database operation bug
- ✅ Enhanced error logging for Bedrock service issues
- ✅ Added comprehensive API endpoint testing utilities
- ⚠️ Identified Bedrock model access requirements

**Architecture Improvements**:
- Enhanced error handling with specific AWS service error types
- Improved logging for debugging complex AI service interactions
- Better parameter validation for cleanup operations
