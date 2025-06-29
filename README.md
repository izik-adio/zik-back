# 🎯 Zik Backend - AI-Powered Goal Management System

> **🌟 Looking for the Frontend?** Check out the [Zik Frontend Repository](https://github.com/izik-adio/zik-front) for the complete user interface and client-side application.

A modern, serverless backend built on AWS that powers the Zik AI life companion app. Transform your long-term goals into achievable daily actions through intelligent task generation and conversational AI.

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![AWS](https://img.shields.io/badge/AWS-232F3E?style=for-the-badge&logo=amazon-aws&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)
![CDK](https://img.shields.io/badge/AWS_CDK-FF9900?style=for-the-badge&logo=amazon-aws&logoColor=white)

## ✨ Features

### 🎮 Epic Quest System
- **AI-Powered Goal Breakdown**: Transform ambitious goals into structured roadmaps
- **Smart Milestone Progression**: Automatic advancement through achievement phases
- **Dynamic Difficulty Adjustment**: Adapts to user progress and capabilities

### 📅 Just-in-Time Task Generation
- **Daily Quest Creation**: Tasks generated exactly when needed
- **Context-Aware Scheduling**: Considers user patterns and preferences
- **Intelligent Prioritization**: AI-driven task ordering and importance

### 🤖 Conversational AI Interface
- **Natural Language Processing**: Powered by AWS Bedrock Claude
- **Context-Aware Responses**: Maintains conversation history and user context
- **Adaptive Communication**: Learns from user interaction patterns

### 👤 Comprehensive User Management
- **Secure Authentication**: AWS Cognito integration
- **Profile Management**: Customizable user preferences and settings
- **Onboarding Flow**: Guided setup for new users

### 📊 Smart Data Management
- **Chat History Persistence**: Long-term conversation storage
- **Automatic Cleanup**: Intelligent data retention policies
- **Real-time Synchronization**: Instant updates across devices

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   API Gateway   │────│   Lambda Functions │────│    DynamoDB     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
    ┌────▼────┐            ┌─────▼──┐              ┌─────▼─────┐
    │ Cognito │            │Bedrock │              │   SES     │
    │  Auth   │            │   AI   │              │  Email    │
    └─────────┘            └────────┘              └───────────┘
```

### Core Components

- **Lambda Handlers**: Event-driven serverless functions
- **DynamoDB**: NoSQL database for scalable data storage
- **API Gateway**: RESTful API endpoints with rate limiting
- **AWS Bedrock**: AI/ML services for conversational intelligence
- **Cognito**: User authentication and authorization
- **SES**: Email notifications and communications

## 🚀 Quick Start

### Prerequisites

- **Node.js** (v18 or later)
- **AWS CLI** configured with appropriate permissions
- **AWS CDK** installed globally (`npm install -g aws-cdk`)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/zik-backend.git
   cd zik-backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   # Copy environment template
   cp .env.example .env
   
   # Edit .env with your AWS configuration
   # Or run the setup script (recommended):
   
   # On Windows:
   scripts\setup-env.bat
   
   # On Linux/Mac:
   chmod +x scripts/setup-env.sh
   ./scripts/setup-env.sh
   ```

4. **Build the project**
   ```bash
   npm run build
   ```

5. **Deploy to AWS**
   ```bash
   # Bootstrap CDK (first time only)
   cdk bootstrap
   
   # Deploy the stack
   cdk deploy
   ```

## 🔧 Development

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Compile TypeScript code |
| `npm run watch` | Watch mode for development |
| `npm test` | Run all tests |
| `npm run test:unit` | Run unit tests only |
| `npm run test:integration` | Run integration tests |
| `npm run test:coverage` | Generate test coverage report |
| `npm run test:watch` | Run tests in watch mode |
| `cdk deploy` | Deploy to AWS |
| `cdk diff` | Compare deployed stack with current state |
| `cdk destroy` | Remove deployed resources |

### Project Structure

```
zik-backend/
├── src/                     # Source code
│   ├── lambda/             # Lambda function handlers
│   │   ├── chatHandler/   # Conversational AI endpoints
│   │   ├── profileHandler/ # User profile management
│   │   └── questHandler/  # Goal and task management
│   ├── services/          # Business logic services
│   ├── models/            # Data models and types
│   └── utils/             # Shared utilities
├── lib/                   # CDK infrastructure code
├── bin/                   # CDK app entry point
├── lambda/               # Standalone Lambda functions
└── __tests__/            # Test files
```

### Environment Variables

Create a `.env` file in the root directory:

```bash
# AWS Configuration
AWS_REGION=us-east-1
CDK_DEFAULT_ACCOUNT=your-account-id
CDK_DEFAULT_REGION=us-east-1

# API Configuration
API_ENDPOINT=your-api-gateway-url

# Cognito Configuration
USER_POOL_ID=your-user-pool-id
USER_POOL_CLIENT_ID=your-client-id

# Database Configuration
CHAT_HISTORY_TABLE=your-chat-table
PROFILE_TABLE=your-profile-table
QUEST_TABLE=your-quest-table
```

## 🧪 Testing

### Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test suites
npm run test:unit          # Unit tests
npm run test:integration   # Integration tests
npm run test:services      # Service layer tests
```

### Test Structure

- **Unit Tests**: Test individual functions and components
- **Integration Tests**: Test API endpoints and service interactions
- **Infrastructure Tests**: Validate CDK stack configuration

## 📖 API Documentation

### Authentication

All API endpoints require authentication via AWS Cognito JWT tokens.

```bash
# Include Authorization header in requests
Authorization: Bearer <jwt-token>
```

### Core Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/chat` | POST | Send message to conversational AI |
| `/profile` | GET/PUT | User profile management |
| `/quests` | GET/POST | Epic quest management |
| `/tasks` | GET/POST/PATCH | Daily task operations |
| `/chat-history` | GET/DELETE | Chat history management |

For detailed API documentation, see [DOCUMENTATION.md](./DOCUMENTATION.md).

## 🔧 Configuration

### AWS Permissions

The deployment requires the following AWS permissions:

- **Lambda**: Function creation and execution
- **DynamoDB**: Table creation and data operations
- **API Gateway**: API creation and management
- **Cognito**: User pool management
- **Bedrock**: AI model access
- **CloudFormation**: Stack management
- **IAM**: Role and policy management

### Rate Limiting

Default rate limits are configured for production use:

- **Burst Limit**: 100 requests
- **Rate Limit**: 50 requests per second
- **Per-user Limits**: Configurable based on subscription tier

## 🚀 Deployment

### Production Deployment

1. **Configure AWS credentials**
   ```bash
   aws configure
   ```

2. **Set environment variables**
   ```bash
   export CDK_DEFAULT_ACCOUNT=your-account-id
   export CDK_DEFAULT_REGION=your-preferred-region
   ```

3. **Deploy the stack**
   ```bash
   cdk deploy --require-approval never
   ```

### Monitoring and Logging

- **CloudWatch Logs**: All Lambda functions log to CloudWatch
- **X-Ray Tracing**: Distributed tracing enabled for debugging
- **CloudWatch Metrics**: Custom metrics for business logic
- **Alarms**: Automated alerts for error rates and performance

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guidelines](CONTRIBUTING.md) for details.

### Development Workflow

1. **Fork the repository**
2. **Create a feature branch**
   ```bash
   git checkout -b feature/amazing-feature
   ```
3. **Make your changes**
4. **Add tests** for new functionality
5. **Ensure tests pass**
   ```bash
   npm test
   ```
6. **Commit your changes**
   ```bash
   git commit -m 'Add amazing feature'
   ```
7. **Push to your branch**
   ```bash
   git push origin feature/amazing-feature
   ```
8. **Open a Pull Request**

### Code Style

- **TypeScript**: Strict mode enabled
- **ESLint**: Configured for best practices
- **Prettier**: Automated code formatting
- **Jest**: Testing framework with comprehensive coverage

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Documentation**: Check [DOCUMENTATION.md](./DOCUMENTATION.md) for detailed technical docs
- **Issues**: Report bugs and request features via GitHub Issues
- **Discussions**: Join community discussions for questions and ideas

## 📊 Status

- ✅ **Core API**: Fully operational
- ✅ **Chat System**: Recently updated and working
- ✅ **User Management**: Complete profile system
- ✅ **Database Operations**: All CRUD functionality working
- ✅ **Test Coverage**: Comprehensive test utilities
- 🔄 **Performance Optimization**: Ongoing improvements
- 🔄 **Documentation**: Continuous updates

---

<div align="center">
  <p>Built with ❤️ for ambitious goal achievers</p>
  <p>
    <a href="#-features">Features</a> •
    <a href="#-quick-start">Quick Start</a> •
    <a href="#-api-documentation">API Docs</a> •
    <a href="#-contributing">Contributing</a>
  </p>
</div>
