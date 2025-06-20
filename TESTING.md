# 🧪 Zik Backend Test Suite

## 📋 Overview

This comprehensive test suite validates the complete user workflow for the Zik backend, from account creation to CRUD operations for goals and tasks. The testing infrastructure is designed to ensure your backend is robust, secure, and ready for production.

## ✅ Quick Status Check

Run this command to see what's ready:

```bash
npm run test:validate
```

## 🚀 Getting Started

### 1. **Infrastructure Test** (Run First)

```bash
npm run test:infrastructure
```

This validates that Jest and TypeScript are working correctly.

### 2. **Unit Tests** (No Deployment Required)

```bash
npm run test:unit
```

Tests individual components and utility functions.

### 3. **Deploy Backend** (Required for E2E)

```bash
cdk deploy
```

Get your API Gateway URL from the deployment output.

### 4. **Configure E2E Tests**

```bash
export API_BASE_URL="https://your-api-gateway-url.amazonaws.com/prod"
```

### 5. **End-to-End Tests**

```bash
npm run test:e2e
```

Tests the complete user workflow against your deployed backend.

## 🧪 Test Commands

| Command                       | Description                         | Requirements                    |
| ----------------------------- | ----------------------------------- | ------------------------------- |
| `npm run test:validate`       | Validate test environment setup     | None                            |
| `npm run test:infrastructure` | Test Jest/TypeScript infrastructure | None                            |
| `npm run test:unit`           | Run unit tests                      | None                            |
| `npm run test:e2e`            | Run end-to-end tests                | Deployed backend + API_BASE_URL |
| `npm run test:all`            | Run all tests                       | Deployed backend + API_BASE_URL |

## 📊 Test Coverage

### 🔐 **Authentication & Authorization** (7 tests)

- ✅ User registration with validation
- ✅ Login/logout workflows
- ✅ Token refresh mechanisms
- ✅ Duplicate email validation
- ✅ Invalid credential handling
- ✅ Password hashing and verification
- ✅ Authorization middleware

### 📋 **Goals Management** (6 tests)

- ✅ Create goals with full validation
- ✅ Read all goals and individual goals
- ✅ Update goals (partial and full)
- ✅ Delete goals with cleanup
- ✅ Input validation and error handling
- ✅ Authorization checks

### ✅ **Tasks Management** (8 tests)

- ✅ Create tasks (with/without goal association)
- ✅ Read tasks with filtering (by goal, by date)
- ✅ Update tasks with status/priority changes
- ✅ Delete tasks with proper cleanup
- ✅ Standalone task creation
- ✅ Goal association validation
- ✅ Priority and status validation
- ✅ Date-based filtering

### 🛡️ **Security & Error Handling** (6 tests)

- ✅ Authorization checks for all endpoints
- ✅ Input sanitization and validation
- ✅ Proper HTTP status codes (400, 401, 404, 429)
- ✅ Rate limiting behavior
- ✅ Malformed JSON handling
- ✅ Edge case handling

## 🎯 Test Quality Features

- **Automatic Cleanup**: Tests clean up all created resources
- **Unique Data**: Each test run uses unique identifiers (no conflicts)
- **Comprehensive Coverage**: Both positive and negative test cases
- **Real Environment**: E2E tests use actual AWS resources
- **Fast Unit Tests**: Complete in under 30 seconds
- **Thorough E2E Tests**: Complete user workflows (2-5 minutes)

## 📁 Test Files

```
test/
├── infrastructure.test.ts      # Jest/TypeScript validation (10 tests)
├── unit.test.ts               # Component tests (21 tests)
├── user-workflow.e2e.test.ts  # End-to-end tests (25+ tests)
├── setup-validator.js         # Environment validation
├── summary-simple.js          # Test summary report
└── README.md                  # Detailed testing guide
```

## 🔍 Example Test Flow

### E2E Test Workflow

1. **Register User** → Get authentication tokens
2. **Create Goal** → "Complete integration testing"
3. **Create Task** → "Set up test environment" (linked to goal)
4. **List Resources** → Verify goal and task appear
5. **Update Resources** → Change status, priority, etc.
6. **Filter & Search** → Test query functionality
7. **Delete Resources** → Clean up (verify 404 after deletion)
8. **Logout** → Invalidate session

### Test Data Example

```javascript
User: testuser1639584000000@example.com
Goal: {
  goalName: "Complete integration testing",
  description: "Validate all backend functionality",
  targetDate: "2025-12-31",
  category: "Development",
  status: "active"
}
Task: {
  taskName: "Set up test environment",
  description: "Configure test infrastructure",
  dueDate: "2025-07-15",
  priority: "high",
  status: "pending",
  goalId: "linked-goal-id"
}
```

## 🚨 Important Notes

- **AWS Costs**: E2E tests create real AWS resources (minimal cost)
- **Cleanup**: Tests automatically clean up created resources
- **Rate Limits**: Cognito rate limiting may affect rapid test runs
- **Environment**: Tests create temporary users (auto-removed)
- **Network**: E2E tests require internet connection to AWS

## ✅ Success Criteria

Your backend is working correctly when:

1. ✅ **Infrastructure tests pass** - Jest/TypeScript working
2. ✅ **Unit tests pass** - All 21 tests complete successfully
3. ✅ **E2E tests pass** - Complete user workflow works
4. ✅ **All CRUD operations work** - Create, Read, Update, Delete
5. ✅ **Authentication flows work** - Registration, login, logout
6. ✅ **Error handling works** - Proper status codes and messages

## 🔧 Troubleshooting

### Common Issues

**E2E Tests Fail with 401 Unauthorized**

```bash
# Check your API Gateway URL
echo $API_BASE_URL

# Verify Cognito configuration in your CDK stack
# Ensure proper JWT authorizer setup
```

**Rate Limiting Errors**

```bash
# Wait a few minutes between test runs
# Use different email addresses for testing
```

**Import Errors in Unit Tests**

```bash
# Ensure all utility files exist
ls lambda/utils/
# Check TypeScript compilation
npm run build
```

## 📚 Documentation

- [`test/README.md`](test/README.md) - Detailed testing guide
- [`TEST_OVERVIEW.md`](TEST_OVERVIEW.md) - High-level test summary
- [`backend/README.md`](README.md) - API documentation

## 🎊 Ready to Test!

Run the complete test suite:

```bash
# 1. Validate setup
npm run test:validate

# 2. Test infrastructure
npm run test:infrastructure

# 3. Test components
npm run test:unit

# 4. Deploy backend
cdk deploy

# 5. Set API URL (replace with your actual URL)
export API_BASE_URL="https://abc123.execute-api.us-east-1.amazonaws.com/prod"

# 6. Test end-to-end
npm run test:e2e

# 7. View summary
node test/summary-simple.js
```

**🎯 Your Zik backend is now thoroughly tested and ready for production!**
