# API Refactor: Goals and Tasks Endpoints

## Overview

The backend API has been refactored to provide clear, RESTful endpoints for managing user goals and daily tasks. This change separates long-term goals ("Epic Quests") and daily tasks ("Daily Quests") into two distinct endpoints, each with its own CRUD operations. All operations are strictly scoped to the authenticated user.

---

## Endpoints Summary

| Endpoint | Resource | Methods Supported      | Description                    |
| -------- | -------- | ---------------------- | ------------------------------ |
| `/goals` | Goals    | GET, POST, PUT, DELETE | Manage long-term goals (epics) |
| `/tasks` | Tasks    | GET, POST, PUT, DELETE | Manage daily tasks (quests)    |

---

## 1. `/goals` Endpoint (Epic Quests)

### Features

- **Create a goal** (`POST /goals`): Add a new long-term goal for the authenticated user.
- **Get all goals** (`GET /goals`): Retrieve all active goals for the authenticated user.
- **Update a goal** (`PUT /goals/{goalId}`): Update a specific goal by its ID.
- **Delete a goal** (`DELETE /goals/{goalId}`): Delete a specific goal by its ID.

### Requirements

- **Authentication:** All requests require a valid JWT in the `Authorization` header.
- **User Scope:** All operations are performed only for the authenticated user (no global access).

### Request/Response Examples

#### Create Goal

- **POST** `/goals`
- **Body:**

```json
{
  "goalName": "Learn Piano",
  "description": "Practice daily and complete grade 1",
  "targetDate": "2025-12-31"
}
```

- **Response:**

```json
{
  "message": "Goal created successfully!",
  "goalId": "goal_abc123"
}
```

#### Get All Goals

- **GET** `/goals`
- **Response:**

```json
{
  "goals": [
    {
      "goalId": "goal_abc123",
      "goalName": "Learn Piano",
      "status": "active",
      "targetDate": "2025-12-31",
      "createdAt": "2025-06-25T10:00:00Z"
    }
  ]
}
```

#### Update Goal

- **PUT** `/goals/{goalId}`
- **Body:**

```json
{
  "goalName": "Learn Piano (Grade 2)",
  "status": "active"
}
```

- **Response:**

```json
{
  "message": "Goal updated successfully!"
}
```

#### Delete Goal

- **DELETE** `/goals/{goalId}`
- **Response:**

```json
{
  "message": "Goal deleted successfully!"
}
```

---

## 2. `/tasks` Endpoint (Daily Quests)

### Features

- **Create a task** (`POST /tasks`): Add a new daily task for the authenticated user.
- **Get tasks** (`GET /tasks`): Retrieve today's tasks, or filter by date, for the authenticated user.
- **Update a task** (`PUT /tasks/{taskId}`): Update a specific task by its ID.
- **Delete a task** (`DELETE /tasks/{taskId}`): Delete a specific task by its ID.

### Requirements

- **Authentication:** All requests require a valid JWT in the `Authorization` header.
- **User Scope:** All operations are performed only for the authenticated user (no global access).

### Request/Response Examples

#### Create Task

- **POST** `/tasks`
- **Body:**

```json
{
  "title": "Practice piano scales",
  "dueDate": "2025-06-25",
  "epicId": "goal_abc123"
}
```

- **Response:**

```json
{
  "message": "Task created successfully!",
  "taskId": "task_xyz789"
}
```

#### Get Tasks (Today or by Date)

- **GET** `/tasks?date=2025-06-25`
- **Response:**

```json
{
  "tasks": [
    {
      "taskId": "task_xyz789",
      "title": "Practice piano scales",
      "dueDate": "2025-06-25",
      "status": "pending",
      "epicId": "goal_abc123"
    }
  ],
  "count": 1
}
```

#### Update Task

- **PUT** `/tasks/{taskId}`
- **Body:**

```json
{
  "title": "Practice piano arpeggios",
  "status": "completed"
}
```

- **Response:**

```json
{
  "message": "Task updated successfully!"
}
```

#### Delete Task

- **DELETE** `/tasks/{taskId}`
- **Response:**

```json
{
  "message": "Task deleted successfully!"
}
```

---

## Notes for Frontend Team

- All endpoints require the `Authorization: Bearer <JWT_TOKEN>` header.
- There is no way to access or modify another user's data.
- The `/tasks` endpoint supports filtering by date using the `date` query parameter (format: `YYYY-MM-DD`).
- The `/goals` endpoint returns all active goals for the authenticated user.
- All responses are JSON.
- If you encounter a 401 error, check the JWT and login flow.

For any questions or if you need more sample payloads, contact the backend team.
