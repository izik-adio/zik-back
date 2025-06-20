# Zik Backend

This backend service provides the API endpoints for the Zik application. It is built using Node.js, TypeScript, and AWS CDK for infrastructure deployment.

## Project Structure

- `bin/`: Contains the entry point for the CDK application (`zik-backend.ts`).
- `lambda/`: Houses the AWS Lambda function handlers for different API operations.
  - `utils/`: Contains utility functions shared across Lambda handlers.
- `lib/`: Defines the AWS CDK stack (`zik-backend-stack.ts`) which provisions all necessary AWS resources.
- `test/`: Includes integration and unit tests for the API and authentication.
- `cdk.json`: Configuration file for AWS CDK.
- `package.json`: Manages project dependencies and scripts.
- `tsconfig.json`: TypeScript compiler options.

## Available Endpoints

The API is secured using Amazon Cognito for user authentication and authorization. All endpoints require a valid JWT token in the `Authorization` header (e.g., `Authorization: Bearer <token>`).

### Authentication

Authentication is handled by Amazon Cognito. The frontend application should integrate with the Cognito User Pool to manage user registration, login, and token refresh.

- **User Registration**: New users can sign up through the frontend.
- **User Login**: Authenticates users and returns JWT tokens (ID token, access token, refresh token).
- **Token Refresh**: Allows obtaining new ID and access tokens using a valid refresh token.
- **Logout**: Invalidates user session (typically handled client-side by discarding tokens).

### Goals API

Base path: `/goals`

- **`POST /goals`**: Creates a new goal.
  - **Request Body**:
    ```json
    {
      "goalName": "string",
      "description": "string",
      "targetDate": "YYYY-MM-DD",
      "category": "string",
      "status": "string" // e.g., 'active', 'completed', 'on-hold'
    }
    ```
  - **Response**: `201 Created` with the created goal object including `goalId`.
- **`GET /goals`**: Retrieves all goals for the authenticated user.
  - **Response**: `200 OK` with an array of goal objects.
- **`GET /goals/{goalId}`**: Retrieves a specific goal by its ID.
  - **Response**: `200 OK` with the goal object.
- **`PUT /goals/{goalId}`**: Updates an existing goal.
  - **Request Body**: Partial or full goal object with fields to update.
  - **Response**: `200 OK` with the updated goal object.
- **`DELETE /goals/{goalId}`**: Deletes a specific goal.
  - **Response**: `204 No Content`.

### Tasks API

Base path: `/tasks`

- **`POST /tasks`**: Creates a new task.
  - **Request Body**:
    ```json
    {
      "taskName": "string",
      "description": "string",
      "dueDate": "YYYY-MM-DD",
      "priority": "string", // e.g., 'high', 'medium', 'low'
      "status": "string", // e.g., 'pending', 'in-progress', 'completed'
      "goalId": "string" // Optional: ID of the goal this task belongs to
    }
    ```
  - **Response**: `201 Created` with the created task object including `taskId`.
- **`GET /tasks`**: Retrieves all tasks for the authenticated user.
  - **Query Parameters**:
    - `goalId`: (Optional) Filter tasks by a specific goal ID.
    - `date`: (Optional) Filter tasks by a specific due date (YYYY-MM-DD).
  - **Response**: `200 OK` with an array of task objects.
- **`GET /tasks/{taskId}`**: Retrieves a specific task by its ID.
  - **Response**: `200 OK` with the task object.
- **`PUT /tasks/{taskId}`**: Updates an existing task.
  - **Request Body**: Partial or full task object with fields to update.
  - **Response**: `200 OK` with the updated task object.
- **`DELETE /tasks/{taskId}`**: Deletes a specific task.
  - **Response**: `204 No Content`.

## Deployment

The backend is deployed using AWS CDK.

1.  **Prerequisites**:

    - AWS CLI configured with appropriate credentials and region.
    - Node.js and npm installed.
    - AWS CDK installed (`npm install -g aws-cdk`).

2.  **Bootstrap CDK (if first time in the AWS account/region)**:

    ```bash
    cdk bootstrap
    ```

3.  **Install Dependencies**:

    ```bash
    npm install
    ```

4.  **Synthesize CloudFormation Template**:

    ```bash
    cdk synth
    ```

5.  **Deploy Stack**:

    ```bash
    cdk deploy
    ```

    This command will provision all the necessary AWS resources, including API Gateway, Lambda functions, DynamoDB tables, and Cognito User Pool. The API Gateway endpoint URL will be outputted upon successful deployment.

## Testing

The project includes tests for API endpoints and authentication logic.

- **Run all tests**:
  ```bash
  npm test
  ```
- **Run specific test files**:
  ```bash
  npx jest test/<test-file-name>.ts
  ```

## Environment Variables

The Lambda functions may require environment variables for configuration (e.g., DynamoDB table names). These are typically set within the CDK stack definition (`lib/zik-backend-stack.ts`) and automatically passed to the Lambda functions during deployment.

Key environment variables managed by CDK:

- `GOALS_TABLE_NAME`: Name of the DynamoDB table for goals.
- `TASKS_TABLE_NAME`: Name of the DynamoDB table for tasks.
- `USER_POOL_ID`: ID of the Cognito User Pool.
- `USER_POOL_CLIENT_ID`: ID of the Cognito User Pool Client.

This README provides a comprehensive overview of the Zik backend.
