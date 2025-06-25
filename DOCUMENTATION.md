# Zik API Documentation

## 1. Overview

The Zik API is a serverless backend infrastructure built on AWS, designed to power the Zik AI life companion mobile application. The API provides intelligent quest management capabilities through conversational AI interactions, allowing users to create, manage, and track their Epic Quests (long-term goals) and Daily Quests (tasks) through natural language conversations with an AI assistant powered by Amazon Bedrock's Claude 3 Haiku model.

## 2. Environment Setup (.env)

Your Expo frontend project requires the following environment variables in your `.env` file:

```env
# API Configuration
API_ENDPOINT=https://dxc20i9fqg.execute-api.us-east-1.amazonaws.com/

# Cognito Configuration
USER_POOL_ID=us-east-1_GFWJSDxFp
USER_POOL_CLIENT_ID=49mk8jp1brkcuj4bv9fi4fn3mu

```

## 3. Proactive Engine (Event-Driven Architecture)

The Proactive Engine is the heart of Zik's automated assistance. It ensures that users' recurring habits and tasks are consistently added to their daily plans without manual intervention.

### Architecture Components

- **Trigger:** An **Amazon EventBridge Rule** is configured to fire daily at 05:00 UTC
- **Compute:** The rule triggers a dedicated **AWS Lambda function** (`recurringTaskGenerator`)
- **Logic:** This function scans the `RecurrenceRules` database, identifies all active rules for the day, and automatically creates new `Task` items for each relevant user
- **Reliability:** This fire-and-forget system is highly reliable and scalable, forming the foundation of Zik's proactive nature

### How It Works

1. **Daily Trigger**: EventBridge rule fires at 5:00 AM UTC every day
2. **Rule Processing**: Lambda function fetches all active recurrence rules
3. **Day Calculation**: For each rule, determines if a task should be created today based on:
   - `daily`: Creates task every day
   - `weekdays`: Creates task Monday-Friday
   - `weekends`: Creates task Saturday-Sunday
   - `weekly`: Creates task on specified days of the week
4. **Task Creation**: Automatically creates new daily tasks using the existing task creation service
5. **Logging**: Comprehensive logging for monitoring and debugging

This system enables users to set up recurring habits once (like "Daily meditation" or "Workout on weekdays") and have them automatically appear in their daily task list without any manual intervention.

## 4. API Endpoints

All endpoints require authentication via Bearer token in the Authorization header unless otherwise specified.

### 4.1. Epic Quest Management (Goals)

#### `GET /goals`

**Description:** Retrieves all active Epic Quests (goals) for the authenticated user.

**Method:** `GET`

**Headers:**

```
Authorization: Bearer <JWT_TOKEN>
```

**Success Response (200 OK):**

```json
{
  "goals": [
    {
      "goalId": "epic_abc123",
      "userId": "user-456",
      "goalName": "Learn Piano",
      "status": "active",
      "description": "Master basic piano techniques and songs",
      "category": "personal-development",
      "targetDate": "2025-12-31",
      "createdAt": "2025-06-24T10:00:00.000Z",
      "updatedAt": "2025-06-24T10:00:00.000Z"
    }
  ],
  "count": 1,
  "timestamp": "2025-06-24T10:30:00.000Z"
}
```

#### `POST /goals`

**Description:** Creates a new Epic Quest (goal) for the authenticated user.

**Method:** `POST`

**Headers:**

```
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

**Request Body (JSON):**

```json
{
  "title": "Learn Piano"
}
```

**Success Response (200 OK):**

```json
{
  "message": "✅ Epic Quest created: 'Learn Piano'! 🎯",
  "timestamp": "2025-06-24T10:30:00.000Z"
}
```

#### `PUT /goals/{goalId}`

**Description:** Updates a specific Epic Quest (goal) for the authenticated user.

**Method:** `PUT`

**Headers:**

```
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

**Path Parameters:**

- `goalId` (required): The unique identifier of the goal to update

**Request Body (JSON):**

```json
{
  "goalName": "Updated Goal Name",
  "description": "Updated description",
  "status": "completed"
}
```

**Success Response (200 OK):**

```json
{
  "message": "✅ Quest updated: 'Updated Goal Name'! 🔄",
  "timestamp": "2025-06-24T10:30:00.000Z"
}
```

#### `DELETE /goals/{goalId}`

**Description:** Deletes a specific Epic Quest (goal) for the authenticated user.

**Method:** `DELETE`

**Headers:**

```
Authorization: Bearer <JWT_TOKEN>
```

**Path Parameters:**

- `goalId` (required): The unique identifier of the goal to delete

**Success Response (200 OK):**

```json
{
  "message": "✅ Quest deleted: 'Learn Piano'! 🗑️",
  "timestamp": "2025-06-24T10:30:00.000Z"
}
```

---

### 4.2. Daily Task Management

#### `GET /tasks`

**Description:** Retrieves all Daily Tasks for the authenticated user, filtered by date (default: today).

**Method:** `GET`

**Headers:**

```
Authorization: Bearer <JWT_TOKEN>
```

**Query Parameters:**

- `date` (optional): Date in YYYY-MM-DD format. If provided, filters Daily Tasks to the specified date. If omitted, returns today's Daily Tasks.

**Success Response (200 OK):**

```json
{
  "tasks": [
    {
      "taskId": "daily_xyz789",
      "userId": "user-456",
      "epicId": "epic_abc123",
      "taskName": "Practice piano scales",
      "status": "pending",
      "dueDate": "2025-06-24",
      "priority": "medium",
      "description": "Practice C major and G major scales",
      "createdAt": "2025-06-24T10:00:00.000Z",
      "updatedAt": "2025-06-24T10:00:00.000Z"
    }
  ],
  "count": 1,
  "timestamp": "2025-06-24T10:30:00.000Z"
}
```

#### `POST /tasks`

**Description:** Creates a new Daily Task for the authenticated user.

**Method:** `POST`

**Headers:**

```
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

**Request Body (JSON):**

```json
{
  "title": "Complete project documentation",
  "dueDate": "2025-06-30",
  "description": "Write comprehensive API documentation",
  "priority": "high",
  "epicId": "epic_abc123"
}
```

**Success Response (200 OK):**

```json
{
  "message": "✅ Daily Task created: 'Complete project documentation'! 📅",
  "timestamp": "2025-06-24T10:30:00.000Z"
}
```

#### `PUT /tasks/{taskId}`

**Description:** Updates a specific Daily Task for the authenticated user.

**Method:** `PUT`

**Headers:**

```
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

**Path Parameters:**

- `taskId` (required): The unique identifier of the task to update

**Request Body (JSON):**

```json
{
  "taskName": "Updated Task Name",
  "description": "Updated description",
  "status": "completed"
}
```

**Success Response (200 OK):**

```json
{
  "message": "✅ Task updated: 'Updated Task Name'! 🔄",
  "timestamp": "2025-06-24T10:30:00.000Z"
}
```

#### `DELETE /tasks/{taskId}`

**Description:** Deletes a specific Daily Task for the authenticated user.

**Method:** `DELETE`

**Headers:**

```
Authorization: Bearer <JWT_TOKEN>
```

**Path Parameters:**

- `taskId` (required): The unique identifier of the task to delete

**Success Response (200 OK):**

```json
{
  "message": "✅ Task deleted: 'Practice piano scales'! 🗑️",
  "timestamp": "2025-06-24T10:30:00.000Z"
}
```

---

| Endpoint | Resource | Methods Supported      | Notes                       |
| -------- | -------- | ---------------------- | --------------------------- |
| `/goals` | Goals    | GET, POST, PUT, DELETE | Only for authenticated user |
| `/tasks` | Tasks    | GET, POST, PUT, DELETE | Only for authenticated user |

---

## 5. Core Data Structures

### Goal Object (Epic Quests)

Goals represent long-term aspirations and objectives in the user's life.

```typescript
type Goal = {
  userId: string; // User's unique identifier
  goalId: string; // Unique identifier (e.g., 'goal_abc123')
  goalName: string; // Goal name/title
  status: 'active' | 'completed' | 'paused'; // Current status
  description?: string; // Optional detailed description
  category?: string; // Optional category (e.g., 'health', 'career')
  targetDate?: string; // Optional target completion date (YYYY-MM-DD)
  createdAt: string; // ISO 8601 timestamp of creation
  updatedAt: string; // ISO 8601 timestamp of last update
};
```

### Task Object (Daily Quests)

Tasks represent specific actions and daily activities users complete to progress toward their goals.

```typescript
type Task = {
  userId: string; // User's unique identifier
  taskId: string; // Unique identifier (e.g., 'task_xyz789')
  taskName: string; // Task name/title
  status: 'pending' | 'in-progress' | 'completed'; // Current status
  dueDate: string; // Due date in YYYY-MM-DD format
  priority: 'low' | 'medium' | 'high'; // Task priority level
  description?: string; // Optional detailed description
  goalId?: string; // ID of the linked Goal (optional)
  createdAt: string; // ISO 8601 timestamp of creation
  updatedAt: string; // ISO 8601 timestamp of last update
};
```

### RecurrenceRule Object

Recurrence Rules define templates for automatically generating daily tasks on a recurring schedule.

```typescript
type RecurrenceRule = {
  userId: string; // User's unique identifier
  recurrenceRuleId: string; // Unique identifier (e.g., 'rule_abc123')
  goalId?: string; // ID of the linked Goal (optional)
  title: string; // Base title for the recurring task
  description?: string; // Optional detailed description
  priority?: 'low' | 'medium' | 'high'; // Priority for the created tasks
  status: 'active' | 'paused'; // Only 'active' rules are processed
  frequency: 'daily' | 'weekdays' | 'weekends' | 'weekly';
  daysOfWeek?: number[]; // For 'weekly' frequency (0=Sun, 1=Mon, ..., 6=Sat)
  createdAt: string; // ISO 8601 timestamp of creation
  updatedAt: string; // ISO 8601 timestamp of last update
};
```

### Chat Response Object

```typescript
type ChatResponse = {
  response: string; // AI-generated response text
  timestamp: string; // ISO 8601 timestamp of response
  requestId: string; // Unique request identifier for debugging
};
```

## 6. Authentication

All API endpoints are protected and require valid authentication. The API uses AWS Cognito for user authentication and JWT tokens for session management.

### Authentication Flow

1. **User Authentication:** Users authenticate through your app's authentication provider (AWS Cognito)
2. **Token Acquisition:** Upon successful authentication, obtain a JWT access token
3. **API Requests:** Include the JWT token in the Authorization header for all API calls

### Authorization Header Format

```
Authorization: Bearer <JWT_ACCESS_TOKEN>
```

### Token Validation

- The backend validates all tokens against the AWS Cognito User Pool
- Tokens are checked for signature validity, expiration, and required claims
- Each request extracts the user ID from the token's `sub` claim for user isolation

## 7. Error Handling

The API uses standard HTTP status codes and provides detailed error messages to help with debugging and user experience.

### Common HTTP Status Codes

#### `200 OK`

Request successful. Response body contains requested data.

#### `201 Created`

Resource created successfully. Response body contains the created resource.

#### `400 Bad Request`

Request is malformed or contains invalid data.

```json
{
  "error": "Missing or invalid message field",
  "timestamp": "2025-06-24T10:30:00.000Z",
  "requestId": "req-12345"
}
```

#### `401 Unauthorized`

JWT token is missing, invalid, or expired. User should be redirected to login.

```json
{
  "error": "Invalid or expired token",
  "timestamp": "2025-06-24T10:30:00.000Z"
}
```

#### `403 Forbidden`

User is authenticated but not authorized to perform the requested action.

#### `404 Not Found`

Requested resource (e.g., specific quest) does not exist or user doesn't have access.

```json
{
  "error": "Quest not found or access denied",
  "timestamp": "2025-06-24T10:30:00.000Z"
}
```

#### `413 Payload Too Large`

Request body exceeds maximum size limits (e.g., message too long).

#### `429 Too Many Requests`

Rate limit exceeded. Client should implement exponential backoff.

#### `500 Internal Server Error`

Generic server error. Display user-friendly message and optionally retry.

```json
{
  "error": "Something went wrong, please try again",
  "timestamp": "2025-06-24T10:30:00.000Z",
  "requestId": "req-12345"
}
```

### Error Handling Best Practices

1. **Token Expiration:** Monitor for 401 responses and implement automatic token refresh
2. **Network Errors:** Implement retry logic with exponential backoff for network failures
3. **User Experience:** Convert technical error messages into user-friendly notifications
4. **Logging:** Log error details (including requestId) for debugging support requests

## 8. Rate Limiting and Performance

### Rate Limits

- Chat endpoint: 10 requests per minute per user
- Quest management endpoints: 30 requests per minute per user

### Performance Considerations

- **Caching:** Consider caching quest data locally and syncing periodically
- **Optimistic Updates:** Update UI immediately for quest status changes, with rollback on failure
- **Pagination:** Large quest lists may be paginated in future versions

### Response Times

- Chat endpoint: 2-5 seconds (AI processing time)
- Quest management: <500ms (database operations)

## 9. Development and Testing

### API Base URLs

- **Production:** `https://your-api-id.execute-api.us-east-1.amazonaws.com/prod`
- **Development:** Contact your backend team for development environment URLs

### Testing Recommendations

1. **Unit Tests:** Test all API integration functions with mock responses
2. **Integration Tests:** Test complete user flows including authentication
3. **Error Scenarios:** Test all error conditions and edge cases
4. **Performance Tests:** Test with realistic data volumes and network conditions

### Debug Information

- All responses include `requestId` for debugging support requests
- Check CloudWatch logs using the `requestId` for detailed error investigation
- Monitor console for detailed error objects during development

## 9. Testing the Proactive Engine

This section provides instructions for testing the new recurring task generator.

### Step A: Deploy the Infrastructure

1. From your project's root directory, run the CDK deployment command:
   ```bash
   cdk deploy
   ```
2. Wait for the deployment to complete. This will create the new `RecurrenceRulesTable`, the `RecurringTaskGenerator` Lambda, and the EventBridge rule.

### Step B: Create a Test Recurrence Rule

1. Navigate to the **AWS Management Console** and go to the **DynamoDB** service.
2. In the left-hand menu, click on **Tables**.
3. Select the **`ZikBackendStack-RecurrenceRulesTable...`** table.
4. Click the **"Explore table items"** button.
5. Click the **"Create item"** button.
6. Switch to the **JSON** view and paste the following sample rule. **Replace `YOUR_USER_ID` with an actual `userId` from your Cognito user pool.**
   ```json
   {
     "userId": "YOUR_USER_ID",
     "recurrenceRuleId": "rule_test_01",
     "title": "Daily Morning Meditation",
     "description": "Meditate for 10 minutes to start the day.",
     "frequency": "daily",
     "priority": "high",
     "status": "active",
     "createdAt": "2025-01-01T00:00:00.000Z",
     "updatedAt": "2025-01-01T00:00:00.000Z"
   }
   ```
7. Click **"Create item"**.

### Step C: Manually Test the Lambda Function

1. Navigate to the **AWS Lambda** service in the console.
2. In the list of functions, find and click on the **`ZikBackendStack-RecurringTaskGenerator...`** function.
3. Select the **"Test"** tab.
4. You can leave the default "hello-world" event template as is, since our function doesn't use the event payload.
5. Click the **"Invoke"** button.
6. The execution should succeed. Check the **"Function logs"** at the bottom of the page. You should see logs like:
   - `Starting recurring task generation job...`
   - `Found 1 active recurrence rules to process.`
   - `Created recurring task for user...`
   - `Job completed. Successfully created 1 new daily quests.`

### Step D: Verify the Result

1. Navigate back to the **DynamoDB** service.
2. Select the **`ZikBackendStack-TasksTable...`** table.
3. Click **"Explore table items"**.
4. You should now see a new item in the table for `YOUR_USER_ID` with the title "Daily Morning Meditation" and today's date as the `dueDate`.

### Step E: Monitor the EventBridge Rule

1. Navigate to the **Amazon EventBridge** service in the console.
2. Click on **"Rules"** in the left sidebar.
3. You should see a rule named **`ZikBackendStack-DailyRecurringTaskRule...`**.
4. Click on the rule to see its configuration and execution history.
5. The rule will automatically trigger daily at 5:00 AM UTC.

---

This completes the implementation of the proactive engine. The Zik backend is now a fully functional, hybrid system capable of both handling direct user commands via its API and proactively assisting users through scheduled, event-driven automation.
