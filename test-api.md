# Zik Backend API Testing Guide

This document provides comprehensive testing for the Zik backend API, starting with authentication through AWS Cognito.

## Authentication Setup

### Cognito Configuration

- **User Pool ID**: `us-east-1_GFWJSDxFp`
- **Client ID**: `49mk8jp1brkcuj4bv9fi4fn3mu`
- **Region**: `us-east-1`

### Prerequisites for Testing

1. **Install AWS CLI and configure it**
2. **Install AWS SDK for testing (optional but recommended)**

## Phase 1: Authentication Testing

### Step 1: Sign Up New User

```bash
# Sign up the user (this will send a verification email)
aws cognito-idp sign-up \
  --client-id 49mk8jp1brkcuj4bv9fi4fn3mu \
  --username "zik.web.pro@gmail.com" \
  --password "ZikTest123!" \
  --user-attributes Name=email,Value=zik.web.pro@gmail.com \
  --region us-east-1
```

**Expected Response:**

```json
{
  "UserSub": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "CodeDeliveryDetails": {
    "Destination": "z***@g***.com",
    "DeliveryMedium": "EMAIL",
    "AttributeName": "email"
  }
}
```

**Action Required:** Check email `zik.web.pro@gmail.com` for verification code.

### Step 2: Confirm Sign Up (After Email Verification)

```bash
# Replace VERIFICATION_CODE with the code received in email
aws cognito-idp confirm-sign-up \
  --client-id 49mk8jp1brkcuj4bv9fi4fn3mu \
  --username "zik.web.pro@gmail.com" \
  --confirmation-code "VERIFICATION_CODE" \
  --region us-east-1
```

**Expected Response:**

```json
{}
```

### Step 3: Sign In to Get JWT Token

```bash
# Sign in to get authentication tokens
aws cognito-idp initiate-auth \
  --client-id 49mk8jp1brkcuj4bv9fi4fn3mu \
  --auth-flow USER_PASSWORD_AUTH \
  --auth-parameters USERNAME="zik.web.pro@gmail.com",PASSWORD="ZikTest123!" \
  --region us-east-1
```

**Expected Response:**

```json
{
  "AuthenticationResult": {
    "AccessToken": "eyJraWQiOiI...",
    "ExpiresIn": 3600,
    "TokenType": "Bearer",
    "RefreshToken": "eyJjdHkiOiJ...",
    "IdToken": "eyJraWQiOiI..."
  }
}
```

### Step 4: Extract and Set JWT Token

```bash
# Extract the AccessToken from the response above and set it as environment variable
export JWT_TOKEN="eyJraWQiOiI..."  # Replace with actual AccessToken
export API_BASE="https://dxc20i9fqg.execute-api.us-east-1.amazonaws.com"

# Verify token is set
echo "JWT Token: ${JWT_TOKEN:0:50}..."
```

### Step 5: Verify Authentication Works

```bash
# Test authentication by making a simple API call
curl -X GET "${API_BASE}/quests?date=2025-06-22" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -v
```

**Expected Response:** 200 OK with empty array `[]` (since no tasks exist yet)

## Alternative: Using Node.js for Authentication

If you prefer to use Node.js for authentication testing, create a simple script:

```javascript
// auth-test.js
const {
  CognitoIdentityProvider,
} = require('@aws-sdk/client-cognito-identity-provider');

const client = new CognitoIdentityProvider({ region: 'us-east-1' });

async function signUp() {
  try {
    const response = await client.signUp({
      ClientId: '49mk8jp1brkcuj4bv9fi4fn3mu',
      Username: 'zik.web.pro@gmail.com',
      Password: 'ZikTest123!',
      UserAttributes: [{ Name: 'email', Value: 'zik.web.pro@gmail.com' }],
    });
    console.log('Sign up successful:', response);
  } catch (error) {
    console.error('Sign up failed:', error);
  }
}

async function confirmSignUp(confirmationCode) {
  try {
    const response = await client.confirmSignUp({
      ClientId: '49mk8jp1brkcuj4bv9fi4fn3mu',
      Username: 'zik.web.pro@gmail.com',
      ConfirmationCode: confirmationCode,
    });
    console.log('Confirmation successful:', response);
  } catch (error) {
    console.error('Confirmation failed:', error);
  }
}

async function signIn() {
  try {
    const response = await client.initiateAuth({
      ClientId: '49mk8jp1brkcuj4bv9fi4fn3mu',
      AuthFlow: 'USER_PASSWORD_AUTH',
      AuthParameters: {
        USERNAME: 'zik.web.pro@gmail.com',
        PASSWORD: 'ZikTest123!',
      },
    });
    console.log('Sign in successful!');
    console.log('Access Token:', response.AuthenticationResult.AccessToken);
    return response.AuthenticationResult.AccessToken;
  } catch (error) {
    console.error('Sign in failed:', error);
  }
}

// Usage:
// signUp();                           // Run first
// confirmSignUp('123456');           // Run after getting email code
// signIn();                          // Run after confirmation
```

## Phase 2: API Testing (After Authentication)

# Zik Backend API Testing Guide

This document provides test examples for the enhanced Zik backend API with the new PUT endpoint for updating quests.

## Prerequisites

1. **Get JWT Token**: Sign up and sign in through AWS Cognito to get a JWT token
2. **Set Environment Variables**:

```bash
export JWT_TOKEN="your_cognito_jwt_token_here"
export API_BASE="https://dxc20i9fqg.execute-api.us-east-1.amazonaws.com"
```

## Test Scenarios

### 1. Create a Goal

```bash
curl -X POST "${API_BASE}/quests" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Learn AWS Architecture",
    "dueDate": "2025-07-31",
    "type": "goal",
    "description": "Master AWS cloud architecture patterns",
    "category": "education"
  }'
```

**Expected Response**: 201 Created with goal object including `goalId` and `status`: "active"

### 2. Create a Task

```bash
curl -X POST "${API_BASE}/quests" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Complete CDK Tutorial",
    "dueDate": "2025-06-30",
    "type": "task",
    "description": "Follow AWS CDK getting started guide",
    "priority": "high"
  }'
```

**Expected Response**: 201 Created with task object including `taskId`, `status`: "pending", and empty `goalId`

### 3. Update Task Status

```bash
curl -X PUT "${API_BASE}/quests/{taskId}?type=task" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "in-progress"
  }'
```

**Expected Response**: 200 OK with updated task object

### 4. Link Task to Goal

```bash
curl -X PUT "${API_BASE}/quests/{taskId}?type=task" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "goalId": "{goalId-from-step-1}",
    "status": "in-progress"
  }'
```

**Expected Response**: 200 OK with task now linked to the goal

### 5. Complete a Task

```bash
curl -X PUT "${API_BASE}/quests/{taskId}?type=task" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "completed"
  }'
```

**Expected Response**: 200 OK with task status updated to "completed"

### 6. Update Goal Status

```bash
curl -X PUT "${API_BASE}/quests/{goalId}?type=goal" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "completed"
  }'
```

**Expected Response**: 200 OK with goal status updated to "completed"

### 7. Get Tasks by Date

```bash
curl -X GET "${API_BASE}/quests?date=2025-06-30" \
  -H "Authorization: Bearer ${JWT_TOKEN}"
```

**Expected Response**: 200 OK with array of tasks for the specified date

## Enhanced Data Model Validation

### Task Schema Validation

The following fields are now formally supported in tasks:

- `status`: "pending" | "in-progress" | "completed" (required, defaults to "pending")
- `goalId`: String (optional, for linking tasks to goals)
- All existing fields remain supported

### Goal Schema Validation

The following fields are now formally supported in goals:

- `status`: "active" | "completed" | "paused" (required, defaults to "active")
- All existing fields remain supported

## Error Cases to Test

### 1. Invalid Status Values

```bash
# This should return 400 Bad Request
curl -X PUT "${API_BASE}/quests/{taskId}?type=task" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "invalid-status"
  }'
```

### 2. Missing Quest Type

```bash
# This should return 400 Bad Request
curl -X PUT "${API_BASE}/quests/{taskId}" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "completed"
  }'
```

### 3. Non-existent Quest ID

```bash
# This should return 404 Not Found
curl -X PUT "${API_BASE}/quests/non-existent-id?type=task" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "completed"
  }'
```

## Database Schema Enhancements

### ChatMessages Table

The new ChatMessages table is now available with the following structure:

- **Table Name**: `ZikBackendStack-ChatMessagesTableB5D45C8B-QR85IWP1I9B9`
- **Primary Key**:
  - PK: `userId` (String)
  - SK: `timestamp` (String, ISO-8601)
- **Attributes**:
  - `messageId` (String)
  - `role` (String: 'user' or 'assistant')
  - `content` (String)

This table is ready for Phase 2 implementation of the chat functionality.

## Implementation Status

✅ **Phase 1 Complete:**

- [x] ChatMessages table created
- [x] Enhanced Goals table schema with status field
- [x] Enhanced Tasks table schema with status and goalId fields
- [x] PUT /quests/{questId} endpoint implemented
- [x] Full CRUD operations for quest management
- [x] Status validation for goals and tasks
- [x] Task-to-goal linking capability

🚧 **Ready for Phase 2:**

- Chat history persistence
- AI chat orchestrator implementation
- Amazon Bedrock integration
- Chat handler Lambda function
