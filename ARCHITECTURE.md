# Zik Backend - Architecture (2025)

## Overview

The Zik backend is structured for maintainability, testability, and scalability. The codebase is organized into a clean architecture with clear separation between Lambda handlers, service logic, database access, shared types, and infrastructure-as-code. Legacy Lambda handlers are retained for compatibility and migration reference.

## Architecture Blueprint

```
zik-back/
├── src/                          # Main source code (clean architecture)
│   ├── lambda/                   # Modern Lambda orchestrators
│   │   ├── chatHandler/
│   │   │   ├── index.ts           # Main chat handler orchestrator
│   │   │   └── __tests__/
│   │   │       └── index.test.ts  # Integration tests
│   │   └── recurringTaskGenerator/
│   │       └── index.ts           # Scheduled recurring task generator
│   │
│   ├── services/                 # Core business and infrastructure services
│   │   ├── auth/
│   │   │   ├── authService.ts     # JWT validation and user identity
│   │   │   └── __tests__/
│   │   │       └── authService.test.ts
│   │   ├── bedrockService.ts      # AI service interactions (Bedrock)
│   │   ├── toolExecutor.ts        # Tool execution coordination
│   │   └── database/              # DynamoDB access modules
│   │       ├── client.ts          # Centralized DynamoDB client
│   │       ├── goals.ts           # Goals CRUD operations
│   │       ├── tasks.ts           # Tasks CRUD operations
│   │       ├── chatMessages.ts    # Chat persistence/context
│   │       ├── recurrenceRules.ts # Recurring quest rules
│   │       └── __tests__/         # Database service tests
│   │           ├── goals.test.ts
│   │           ├── tasks.test.ts
│   │           ├── chatMessages.test.ts
│   │
│   ├── utils/                    # Logging, error, and response helpers
│   │   ├── logger.ts
│   │   ├── errors.ts
│   │   ├── responses.ts
│   │   └── __tests__/
│   │       ├── logger.test.ts
│   │       ├── errors.test.ts
│   │       └── responses.test.ts
│   │
│   ├── types/
│   │   └── index.ts               # Shared TypeScript interfaces
│   │
│   └── config.ts                  # Centralized environment config
│
├── lambda/                        # Legacy Lambda handlers (for migration/testing)
│   ├── manageGoals.ts            # Goals management Lambda
│   └── manageQuests.ts           # Tasks management Lambda
│
├── lib/                          # AWS CDK infrastructure code
│   └── zik-backend-stack.ts      # CDK stack definition
│
├── bin/                          # CDK app entry point
│   └── zik-backend.ts            # CDK application
│
├── test/                         # Integration and E2E tests
│
├── dist/                         # TypeScript build output
│   ├── lambda/                   # Compiled Lambda functions
│   └── src/                      # Compiled source modules
│
├── cdk.out/                      # CDK build artifacts (generated)
├── node_modules/                 # Dependencies (generated)
├── package.json                  # Node.js project configuration
├── tsconfig.json                 # TypeScript configuration
├── jest.config.js                # Test configuration
├── cdk.json                      # CDK configuration
├── ARCHITECTURE.md               # This documentation
├── DOCUMENTATION.md              # API and usage documentation
└── plan.txt                      # Planning notes
```

### Notes
- **src/lambda/** contains orchestrator handlers for new features and is the main entry point for new Lambda functions.
- **lambda/** contains legacy Lambda handlers for reference and migration.
- **src/services/** implements business logic, database access, and integrations.
- **src/types/** and **src/utils/** provide shared types and utilities.
- **lib/** and **bin/** are for AWS CDK infrastructure-as-code.
- **test/** is for integration and E2E tests.
- **dist/** and **cdk.out/** are build artifacts.
- Top-level files include configuration, documentation, and developer utilities.
