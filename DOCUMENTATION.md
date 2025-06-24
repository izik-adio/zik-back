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

## 3. API Endpoints

All endpoints require authentication via Bearer token in the Authorization header unless otherwise specified.

### 3.1. AI Interaction

#### `POST /chat`

**Description:** The primary endpoint for all conversational interactions with the Zik AI assistant. This endpoint handles everything from simple greetings and questions to complex commands for creating, updating, and managing quests. The AI automatically determines whether to provide information or execute actions based on user intent.

**Method:** `POST`

**Headers:**

```
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

**Request Body (JSON):**

```json
{
  "message": "Create a new epic quest to learn piano by the end of the year"
}
```

**Success Response (200 OK):**

```json
{
  "response": "✅ Epic Quest created! 'Learn Piano' is now active in your quest log.",
  "timestamp": "2025-06-24T10:30:00.000Z",
  "requestId": "req-12345"
}
```

**AI Capabilities:**

- **Query Intent:** Answers questions about existing quests, provides summaries, shows progress
- **Action Intent:** Creates, updates, or deletes quests based on natural language commands
- **Context Awareness:** Remembers conversation history and current user context

**Example Interactions:**

```
User: "What quests do I have today?"
AI: "You have 3 Daily Quests for today: Complete morning workout, Review project proposal, and Call mom."

User: "Mark the workout as complete"
AI: "✅ Daily Quest completed! 'Complete morning workout' is now marked as done."

User: "Create a daily quest to read for 30 minutes tomorrow"
AI: "✅ Daily Quest created! 'Read for 30 minutes' has been added for tomorrow."
```

**Error Responses:**

- `400 Bad Request`: Invalid request format or missing message
- `401 Unauthorized`: Missing or invalid JWT token
- `413 Payload Too Large`: Message exceeds maximum length (5000 characters)
- `500 Internal Server Error`: AI service or database error

### 3.2. Quest Management

#### `GET /quests`

**Description:** Retrieves all quests for the authenticated user, filtered by date for Daily Quests. This endpoint provides a complete view of the user's quest ecosystem.

**Method:** `GET`

**Headers:**

```
Authorization: Bearer <JWT_TOKEN>
```

**Query Parameters:**

- `date` (optional): Date in YYYY-MM-DD format. If provided, filters Daily Quests to the specified date. If omitted, returns today's Daily Quests.

**Success Response (200 OK):**

```json
{
  "epicQuests": [
    {
      "questId": "epic_abc123",
      "userId": "user-456",
      "title": "Learn Piano",
      "status": "active",
      "description": "Master basic piano techniques and songs",
      "category": "personal-development",
      "targetDate": "2025-12-31",
      "createdAt": "2025-06-24T10:00:00.000Z",
      "updatedAt": "2025-06-24T10:00:00.000Z"
    }
  ],
  "dailyQuests": [
    {
      "questId": "daily_xyz789",
      "userId": "user-456",
      "epicId": "epic_abc123",
      "title": "Practice piano scales",
      "status": "pending",
      "dueDate": "2025-06-24",
      "priority": "medium",
      "description": "Practice C major and G major scales",
      "createdAt": "2025-06-24T10:00:00.000Z",
      "updatedAt": "2025-06-24T10:00:00.000Z"
    }
  ]
}
```

#### `PUT /quests/{questId}`

**Description:** Updates a specific quest's properties, commonly used for marking quests as complete or modifying quest details.

**Method:** `PUT`

**Headers:**

```
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

**Path Parameters:**

- `questId` (required): The unique identifier of the quest to update

**Query Parameters:**

- `type` (required): Either "goal" for Epic Quests or "task" for Daily Quests

**Request Body (JSON):**

```json
{
  "status": "completed",
  "title": "Updated quest title",
  "description": "Updated description",
  "priority": "high"
}
```

**Success Response (200 OK):**
Returns the updated quest object with the same structure as shown in the GET response above.

#### `DELETE /quests/{questId}`

**Description:** Permanently deletes a specific quest from the user's quest log.

**Method:** `DELETE`

**Headers:**

```
Authorization: Bearer <JWT_TOKEN>
```

**Path Parameters:**

- `questId` (required): The unique identifier of the quest to delete

**Query Parameters:**

- `type` (required): Either "goal" for Epic Quests or "task" for Daily Quests

**Success Response (200 OK):**

```json
{
  "message": "Quest deleted successfully",
  "questId": "epic_abc123",
  "timestamp": "2025-06-24T10:30:00.000Z"
}
```

#### `POST /quests`

**Description:** Creates a new quest (Epic Quest or Daily Quest) with specified parameters.

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
  "type": "task",
  "dueDate": "2025-06-30",
  "description": "Write comprehensive API documentation",
  "priority": "high",
  "category": "work",
  "epicId": "epic_abc123"
}
```

**Success Response (201 Created):**
Returns the created quest object with generated IDs and timestamps.

## 4. Core Data Structures

### EpicQuest Object

Epic Quests represent long-term goals and aspirations in the user's life.

```typescript
type EpicQuest = {
  questId: string; // Unique identifier (e.g., 'epic_abc123')
  userId: string; // User's unique identifier
  title: string; // Quest name/title
  status: 'active' | 'completed' | 'paused'; // Current status
  description?: string; // Optional detailed description
  category?: string; // Optional category (e.g., 'health', 'career')
  targetDate?: string; // Optional target completion date (YYYY-MM-DD)
  createdAt: string; // ISO 8601 timestamp of creation
  updatedAt: string; // ISO 8601 timestamp of last update
};
```

### DailyQuest Object

Daily Quests represent specific tasks and actions users take to progress toward their Epic Quests.

```typescript
type DailyQuest = {
  questId: string; // Unique identifier (e.g., 'daily_xyz789')
  userId: string; // User's unique identifier
  epicId?: string; // ID of the linked Epic Quest (optional)
  title: string; // Task name/title
  status: 'pending' | 'in-progress' | 'completed' | 'skipped'; // Current status
  dueDate: string; // Due date in YYYY-MM-DD format
  priority: 'low' | 'medium' | 'high'; // Task priority level
  description?: string; // Optional detailed description
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

## 5. Authentication

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

## 6. Error Handling

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

## 7. Rate Limiting and Performance

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

## 8. Development and Testing

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

---

_This documentation covers Zik API v1.0. For questions or issues, please contact the backend development team._
