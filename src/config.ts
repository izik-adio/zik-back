/**
 * Centralized configuration management for environment variables
 */
export const config = {
  // DynamoDB Table Names
  chatMessagesTableName: process.env.CHAT_MESSAGES_TABLE_NAME || '',
  goalsTableName: process.env.GOALS_TABLE_NAME || '',
  tasksTableName: process.env.TASKS_TABLE_NAME || '',
  usersTableName: process.env.USERS_TABLE_NAME || '',
  recurrenceRulesTableName: process.env.RECURRENCE_RULES_TABLE_NAME || '',
  milestonesTableName: process.env.MILESTONES_TABLE_NAME || '',

  // DynamoDB Indexes
  userIdDueDateIndex: process.env.USER_ID_DUE_DATE_INDEX || 'user-due-date-index',
  usernameIndex: 'username-index',
  emailIndex: 'email-index',

  // Cognito Configuration
  userPoolId: process.env.USER_POOL_ID!,
  userPoolClientId: process.env.USER_POOL_CLIENT_ID!,

  // AWS Configuration
  awsRegion: process.env.AWS_REGION || 'us-east-1',
  bedrockRegion: 'us-east-1',
  // Bedrock Model Configuration
  bedrockModelId: 'anthropic.claude-3-haiku-20240307-v1:0',
  maxTokens: 2048,

  // Application Limits
  maxMessageLength: 5000,
  maxTitleLength: 200,
  defaultChatHistoryLimit: 10,
  maxChatHistoryPerUser: 10, // Maximum number of messages to keep per user
  chatHistoryRetentionDays: 30, // TTL for individual messages (fallback cleanup)

  // Step Functions & Lambda ARNs (optional for some Lambda functions)
  roadmapGeneratorWorkflowArn: process.env.ROADMAP_GENERATOR_WORKFLOW_ARN || '',
  dailyQuestGeneratorLambdaArn: process.env.DAILY_QUEST_GENERATOR_LAMBDA_ARN || '',

  // JWT Configuration
  accessTokenExpiry: '1d',
  refreshTokenExpiry: '7d',
  sessionTokenExpiry: '24h',
} as const;

// Validate required environment variables on module load
const requiredEnvVars = [
  'USER_POOL_ID',
  'USER_POOL_CLIENT_ID',
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}
