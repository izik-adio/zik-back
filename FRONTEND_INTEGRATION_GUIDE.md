# Zik Backend Integration Guide for Frontend Team
*Date: June 27, 2025*

## 🚀 Epic Quest & Roadmap System Integration

The Zik backend now fully supports the **Epic Quest & Roadmap Generator** feature! This guide provides everything your frontend team needs to integrate with our intelligent goal breakdown and milestone progression system.

## 📋 Table of Contents
1. [API Overview](#api-overview)
2. [Epic Quest Management](#epic-quest-management)
3. [Milestone System](#milestone-system)
4. [Daily Quest Generation](#daily-quest-generation)
5. [Authentication](#authentication)
6. [Error Handling](#error-handling)
7. [Testing Endpoints](#testing-endpoints)
8. [Quick Verification Test](#quick-verification-test)

---

## API Overview

**Base URL**: `https://h5k4oat3hi.execute-api.us-east-1.amazonaws.com/`

**Authentication**: All requests require Bearer token in Authorization header
```
Authorization: Bearer <your-jwt-token>
```

---

## Epic Quest Management

### 1. Create an Epic Quest (Goal)

**Endpoint**: `POST /goals`

**Purpose**: Creates a high-level goal. If the goal is complex enough, it automatically triggers roadmap generation in the background.

**Request Body**:
```json
{
  "goalName": "Learn Guitar",
  "description": "I want to become proficient at playing acoustic guitar",
  "targetDate": "2025-12-31",
  "category": "Skills"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "message": "✅ Epic Quest created: 'Learn Guitar'! 🚀 I'm now generating a personalized roadmap with milestones and tasks to help you achieve this goal!",
    "goalId": "goal_abc123",
    "roadmapStatus": "generating"
  }
}
```

**Key Points**:
- The system uses AI to determine if a goal needs a roadmap
- Complex goals automatically get `roadmapStatus: "generating"`
- Roadmap generation happens asynchronously via AWS Step Functions
- Check the goal status periodically to see when roadmap is ready

### 2. Get All Goals

**Endpoint**: `GET /goals`

**Response**:
```json
{
  "success": true,
  "data": {
    "goals": [
      {
        "goalId": "goal_abc123",
        "userId": "user_xyz",
        "goalName": "Learn Guitar",
        "description": "I want to become proficient at playing acoustic guitar",
        "targetDate": "2025-12-31",
        "category": "Skills",
        "status": "in-progress",
        "roadmapStatus": "ready",
        "createdAt": "2025-06-27T10:00:00Z",
        "updatedAt": "2025-06-27T10:05:00Z"
      }
    ],
    "count": 1
  }
}
```

**roadmapStatus Values**:
- `"none"`: No roadmap needed/requested
- `"generating"`: AI is creating the roadmap (usually takes 30-60 seconds)
- `"ready"`: Roadmap is complete and milestones are available

### 3. Update a Goal

**Endpoint**: `PUT /goals/{goalId}`

**Request Body**:
```json
{
  "goalName": "Master Acoustic Guitar",
  "status": "in-progress"
}
```

---

## Milestone System

### 1. Get Milestones for a Goal

**Endpoint**: `GET /goals/{goalId}/milestones`

**Purpose**: Retrieve the AI-generated roadmap milestones for an Epic Quest

**Response**:
```json
{
  "success": true,
  "data": {
    "milestones": [
      {
        "milestoneId": "milestone_def456",
        "epicId": "goal_abc123",
        "sequence": 1,
        "userId": "user_xyz",
        "title": "Week 1-2: Foundation Building",
        "description": "Learn basic guitar anatomy, proper posture, and fundamental techniques",
        "status": "completed",
        "durationInDays": 14,
        "createdAt": "2025-06-27T10:05:00Z",
        "updatedAt": "2025-06-27T10:05:00Z"
      },
      {
        "milestoneId": "milestone_ghi789",
        "epicId": "goal_abc123",
        "sequence": 2,
        "userId": "user_xyz",
        "title": "Week 3-4: Basic Chords",
        "description": "Master G, C, D, and Em chords with smooth transitions",
        "status": "active",
        "durationInDays": 14,
        "createdAt": "2025-06-27T10:05:00Z",
        "updatedAt": "2025-06-27T10:05:00Z"
      },
      {
        "milestoneId": "milestone_jkl012",
        "epicId": "goal_abc123",
        "sequence": 3,
        "userId": "user_xyz",
        "title": "Week 5-6: Strumming Patterns",
        "description": "Learn common strumming patterns and rhythm techniques",
        "status": "locked",
        "durationInDays": 14,
        "createdAt": "2025-06-27T10:05:00Z",
        "updatedAt": "2025-06-27T10:05:00Z"
      }
    ],
    "count": 3
  }
}
```

**Milestone Status Values**:
- `"locked"`: Not yet available (previous milestones must be completed first)
- `"active"`: Currently in progress (has daily quests generated)
- `"completed"`: All tasks in this milestone have been finished

**Key Integration Points**:
- Use `sequence` to display milestones in order
- Only `"active"` milestones have daily quests available
- When all tasks in an `"active"` milestone are completed, the system automatically:
  1. Marks current milestone as `"completed"`
  2. Activates the next milestone (`"locked"` → `"active"`)
  3. Generates daily quests for the new active milestone

---

## Daily Quest Generation

### 1. Get Today's Tasks

**Endpoint**: `GET /tasks`

**Query Parameters**:
- `date` (optional): Specific date in YYYY-MM-DD format (defaults to today)

**Response**:
```json
{
  "success": true,
  "data": {
    "tasks": [
      {
        "taskId": "task_mno345",
        "userId": "user_xyz",
        "taskName": "Practice G-C-D chord transitions for 15 minutes",
        "description": "Focus on smooth finger placement and clean chord sounds",
        "dueDate": "2025-06-27",
        "priority": "medium",
        "status": "pending",
        "goalId": "goal_abc123",
        "milestoneId": "milestone_ghi789",
        "createdAt": "2025-06-27T10:05:00Z",
        "updatedAt": "2025-06-27T10:05:00Z"
      },
      {
        "taskId": "task_pqr678",
        "userId": "user_xyz",
        "taskName": "Watch chord transition tutorial video",
        "description": "Study proper finger positioning techniques",
        "dueDate": "2025-06-27",
        "priority": "low",
        "status": "completed",
        "goalId": "goal_abc123",
        "milestoneId": "milestone_ghi789",
        "createdAt": "2025-06-27T10:05:00Z",
        "updatedAt": "2025-06-27T10:05:00Z"
      }
    ],
    "count": 2
  }
}
```

**Key Fields**:
- `milestoneId`: Links the task to its parent milestone (can be null for standalone tasks)
- `goalId`: Links the task to its parent Epic Quest (can be null for standalone tasks)
- `priority`: `"low"`, `"medium"`, or `"high"`
- `status`: `"pending"`, `"in-progress"`, or `"completed"`

### 2. Create a Manual Task

**Endpoint**: `POST /tasks`

**Request Body**:
```json
{
  "title": "Practice new song",
  "dueDate": "2025-06-28",
  "epicId": "goal_abc123"
}
```

### 3. Update a Task (Critical for Milestone Progression!)

**Endpoint**: `PUT /tasks/{taskId}`

**Request Body**:
```json
{
  "status": "completed"
}
```

**🔥 Important**: When you mark a task as `"completed"`, the backend automatically:
1. Checks if this task belongs to a milestone
2. If all tasks in that milestone are now complete:
   - Marks the milestone as `"completed"`
   - Activates the next milestone in sequence
   - Generates new daily quests for the next milestone
3. If it was the last milestone, marks the entire Epic Quest as `"completed"`

**This means your frontend should**:
- Refresh the milestones list after completing tasks
- Refresh today's tasks to see newly generated quests
- Show progress indicators based on milestone completion

### 4. Delete a Task

**Endpoint**: `DELETE /tasks/{taskId}`

---

## Authentication

All API endpoints require authentication. Use the token you get from the login process:

```javascript
const response = await fetch(`${API_BASE_URL}/tasks`, {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${userToken}`,
    'Content-Type': 'application/json'
  }
});
```

---

## Error Handling

### Standard Error Response Format

```json
{
  "success": false,
  "error": {
    "message": "Invalid date format. Expected YYYY-MM-DD",
    "code": 400
  }
}
```

### Common Error Codes

- **400**: Bad Request (invalid input)
- **401**: Unauthorized (missing/invalid token)
- **404**: Not Found (resource doesn't exist)
- **500**: Internal Server Error

### Milestone-Specific Scenarios

**Scenario**: User tries to get milestones for a goal that's still generating
```json
{
  "success": true,
  "data": {
    "milestones": [],
    "count": 0
  }
}
```
*Note*: Check the goal's `roadmapStatus` - if it's `"generating"`, milestones aren't ready yet.

**Scenario**: User completes a task but milestone progression fails
- The task update will still succeed
- Error will be logged on backend
- Frontend should continue normally

---

## Testing Endpoints

### 1. Complete End-to-End Flow Test

```javascript
// 1. Create an Epic Quest
const createGoal = await fetch(`${API_BASE_URL}/goals`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    goalName: "Learn Web Development",
    description: "Master full-stack web development with React and Node.js",
    targetDate: "2025-12-31",
    category: "Career"
  })
});

const goalResponse = await createGoal.json();
const goalId = goalResponse.data.goalId;

// 2. Wait for roadmap generation (poll every 5 seconds)
let roadmapReady = false;
while (!roadmapReady) {
  const checkGoal = await fetch(`${API_BASE_URL}/goals`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const goals = await checkGoal.json();
  const goal = goals.data.goals.find(g => g.goalId === goalId);
  
  if (goal.roadmapStatus === 'ready') {
    roadmapReady = true;
  } else {
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
}

// 3. Get the generated milestones
const milestones = await fetch(`${API_BASE_URL}/goals/${goalId}/milestones`, {
  headers: { 'Authorization': `Bearer ${token}` }
});

// 4. Get today's tasks (should include tasks for the first active milestone)
const tasks = await fetch(`${API_BASE_URL}/tasks`, {
  headers: { 'Authorization': `Bearer ${token}` }
});

// 5. Complete a task to trigger progression
const taskList = await tasks.json();
const firstTask = taskList.data.tasks[0];

await fetch(`${API_BASE_URL}/tasks/${firstTask.taskId}`, {
  method: 'PUT',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ status: 'completed' })
});

// 6. Check if milestone progression occurred
// (Re-fetch milestones and tasks to see changes)
```

### 2. Recommended Frontend State Management

```javascript
// Example React hook for managing Epic Quest state
const useEpicQuest = (goalId) => {
  const [goal, setGoal] = useState(null);
  const [milestones, setMilestones] = useState([]);
  const [todayTasks, setTodayTasks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const refreshMilestones = async () => {
    const response = await fetch(`/goals/${goalId}/milestones`);
    const data = await response.json();
    setMilestones(data.data.milestones);
  };

  const refreshTasks = async () => {
    const response = await fetch(`/tasks`);
    const data = await response.json();
    setTodayTasks(data.data.tasks);
  };

  const completeTask = async (taskId) => {
    await fetch(`/tasks/${taskId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed' })
    });
    
    // Refresh both milestones and tasks as completion may trigger progression
    await Promise.all([refreshMilestones(), refreshTasks()]);
  };

  return {
    goal,
    milestones,
    todayTasks,
    isLoading,
    refreshMilestones,
    refreshTasks,
    completeTask
  };
};
```

---

## 🎯 Key Implementation Tips

1. **Polling for Roadmap Generation**: When `roadmapStatus` is `"generating"`, poll every 5-10 seconds until it becomes `"ready"`

2. **Refresh After Task Completion**: Always refresh both milestones and tasks after completing a task, as it may trigger milestone progression

3. **Visual Progress Indicators**: Use milestone status to show user progress through their Epic Quest journey

4. **Handle Empty States**: New goals may have empty milestones/tasks until generation completes

5. **Error Resilience**: Milestone progression failures won't break task updates - the core functionality remains intact

---

## 🔧 Debugging Tips

- Check CloudWatch logs for detailed error information
- Use the `requestId` from responses to trace specific requests
- Monitor the Step Function execution in AWS Console for roadmap generation issues
- Verify DynamoDB tables have the expected data structure

---

## 🧪 Quick Verification Test

Here's a simple cURL test to verify the system is working (replace `<your-token>` with a valid JWT):

```bash
# 1. Test API Health (should return goals)
curl -H "Authorization: Bearer <your-token>" \
     https://h5k4oat3hi.execute-api.us-east-1.amazonaws.com/goals

# 2. Create an Epic Quest that will trigger roadmap generation
curl -X POST \
     -H "Authorization: Bearer <your-token>" \
     -H "Content-Type: application/json" \
     -d '{"goalName":"Learn Python Programming","description":"Master Python for data science","category":"Skills"}' \
     https://h5k4oat3hi.execute-api.us-east-1.amazonaws.com/goals

# 3. Check if roadmap generation completed (repeat until roadmapStatus is "ready")
curl -H "Authorization: Bearer <your-token>" \
     https://h5k4oat3hi.execute-api.us-east-1.amazonaws.com/goals

# 4. Get generated milestones (replace goal_abc123 with actual goalId from step 2)
curl -H "Authorization: Bearer <your-token>" \
     https://h5k4oat3hi.execute-api.us-east-1.amazonaws.com/goals/goal_abc123/milestones

# 5. Get today's tasks (should include tasks for the first active milestone)
curl -H "Authorization: Bearer <your-token>" \
     https://h5k4oat3hi.execute-api.us-east-1.amazonaws.com/tasks
```

**Expected Flow**:
1. Goal is created with `roadmapStatus: "generating"`
2. After 30-60 seconds, `roadmapStatus` becomes `"ready"`
3. Milestones appear with first one having `status: "active"`
4. Daily tasks are automatically generated for the active milestone

---

**Need Help?** 
- Check the `DOCUMENTATION.md` file for detailed API specifications
- Review the `ARCHITECTURE.md` file for system design details
- All endpoints follow RESTful conventions and return consistent response formats

Happy coding! 🚀
