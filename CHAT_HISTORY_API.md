# Chat History API Documentation

## Overview

The Chat History API provides simplified endpoints for managing user chat message history. The API supports reading and clearing chat messages, with automatic cleanup that maintains only the last 10 messages per user.

**Simplified Design:**
- GET /chat-history - fetches all available messages (max 10)
- DELETE /chat-history - clears all chat history
- No query parameters needed - simplified for better user experience

## Base URL

```
https://h5k4oat3hi.execute-api.us-east-1.amazonaws.com/
```

## Authentication

All endpoints require authentication via AWS Cognito JWT token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

## Endpoints

### GET /chat-history

Retrieves all of the user's chat history (maximum 10 messages due to automatic cleanup).

**Parameters:** None

**Request:**
```http
GET /chat-history
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response (200 OK):**
```json
{
  "messages": [
    {
      "userId": "user123",
      "timestamp": "2025-06-27T10:00:00.000Z",
      "messageId": "msg-1",
      "role": "user",
      "content": "Hello, how can I create a new goal?"
    },
    {
      "userId": "user123",
      "timestamp": "2025-06-27T10:01:00.000Z",
      "messageId": "msg-2",
      "role": "assistant",
      "content": "I'd be happy to help you create a new goal! What would you like to achieve?"
    }
  ],
  "count": 2,
  "timestamp": "2025-06-27T10:02:00.000Z"
}
```

**Error Responses:**
- `401` - Missing or invalid authorization token
- `500` - Internal server error

### DELETE /chat-history

Clears all of the user's chat history.

**Parameters:** None

**Request:**
```http
DELETE /chat-history
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response (200 OK):**
```json
{
  "deletedMessages": 8,
  "message": "All chat history cleared",
  "timestamp": "2025-06-27T10:03:00.000Z"
}
```

**Error Responses:**
- `401` - Missing or invalid authorization token
- `500` - Internal server error

## Frontend Integration Examples

### React/JavaScript Example

```javascript
// Fetch all chat history (max 10 messages)
async function fetchChatHistory() {
  const token = localStorage.getItem('authToken');
  
  try {
    const response = await fetch(
      'https://h5k4oat3hi.execute-api.us-east-1.amazonaws.com/chat-history',
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    return data.messages;
  } catch (error) {
    console.error('Error fetching chat history:', error);
    throw error;
  }
}

// Clear all chat history
async function clearChatHistory() {
  const token = localStorage.getItem('authToken');
  
  try {
    const response = await fetch(
      'https://h5k4oat3hi.execute-api.us-east-1.amazonaws.com/chat-history',
      {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log(data.message);
    return data;
  } catch (error) {
    console.error('Error clearing chat history:', error);
    throw error;
  }
}

// Usage examples
async function loadChatTab() {
  try {
    const messages = await fetchChatHistory();
    // Update your chat UI with the messages
    displayMessages(messages);
  } catch (error) {
    // Handle error (show error message to user)
    showErrorMessage('Failed to load chat history');
  }
}

async function handleClearChatButton() {
  if (confirm('Are you sure you want to clear all chat history? This cannot be undone.')) {
    try {
      const result = await clearChatHistory();
      // Update UI to reflect cleared history
      clearChatUI();
      showSuccessMessage(result.message);
    } catch (error) {
      showErrorMessage('Failed to clear chat history');
    }
  }
}
```

### TypeScript Types

```typescript
interface ChatMessage {
  userId: string;
  timestamp: string;
  messageId: string;
  role: 'user' | 'assistant';
  content: string;
}

interface ChatHistoryResponse {
  messages: ChatMessage[];
  count: number;
  timestamp: string;
}

interface ClearHistoryResponse {
  deletedMessages: number;
  message: string;
  timestamp: string;
}

interface ErrorResponse {
  error: string;
  timestamp: string;
  requestId?: string;
}
```

## Automatic Cleanup

**Important Notes:**
- The system automatically limits each user to a maximum of 10 chat messages
- When new messages are saved, older messages are automatically deleted
- Messages also have a TTL (Time To Live) of 30 days for automatic expiration
- The GET endpoint always returns all available messages (never more than 10)
- The DELETE endpoint clears all messages with no retention options
- The frontend should handle empty chat history gracefully

## Rate Limiting

The API uses AWS API Gateway's default throttling:
- 10,000 requests per second per AWS account
- 5,000 concurrent requests per AWS account

For production use, consider implementing client-side caching and only fetching chat history when the chat interface is opened, since the API is now simplified to always return all available messages.

## Error Handling

Always implement proper error handling in your frontend:

1. **Network Errors**: Handle connection failures gracefully
2. **Authentication Errors**: Redirect to login when tokens expire
3. **Server Errors**: Show user-friendly error messages
4. **Rate Limiting**: Implement retry logic with exponential backoff

## Support

For technical issues or questions about the Chat History API, please contact the backend development team.
