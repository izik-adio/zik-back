import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import {
  NodejsFunction,
  NodejsFunctionProps,
} from 'aws-cdk-lib/aws-lambda-nodejs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as path from 'path';
import { Duration } from 'aws-cdk-lib';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as stepfunctions from 'aws-cdk-lib/aws-stepfunctions';
import * as stepfunctionsTasks from 'aws-cdk-lib/aws-stepfunctions-tasks';

export class ZikBackendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Retrieve the JWT secret from AWS Secrets Manager
    const jwtSecret = secretsmanager.Secret.fromSecretCompleteArn(
      this,
      'JwtSecretFromArn',
      'arn:aws:secretsmanager:us-east-1:468120368975:secret:zik/jwtSecret-nz8nmy'
    );

    // --- API Gateway Definition (define early if URL is needed by Lambdas) ---
    const httpApi = new apigatewayv2.HttpApi(this, 'ZikApi', {
      corsPreflight: {
        allowHeaders: [
          'Content-Type',
          'X-Amz-Date',
          'Authorization',
          'X-Api-Key',
        ],
        allowMethods: [
          apigatewayv2.CorsHttpMethod.OPTIONS,
          apigatewayv2.CorsHttpMethod.GET,
          apigatewayv2.CorsHttpMethod.POST,
          apigatewayv2.CorsHttpMethod.PUT,
          apigatewayv2.CorsHttpMethod.DELETE,
        ],
        allowOrigins: ['*'], // Be more specific in production
      },
      // Consider adding default authorizer if most routes are protected
    });

    // --- Cognito User Pool and Client (define early) ---
    const userPool = new cognito.UserPool(this, 'ZikUserPool', {
      userPoolName: 'zik-user-pool',
      selfSignUpEnabled: true, // Set to true if you want users to sign up themselves
      signInAliases: { email: true }, // Users can sign in with their email
      autoVerify: { email: true }, // Automatically verify email if possible (e.g., through a link)
      standardAttributes: {
        email: {
          required: true,
          mutable: true,
        },
        // Add other standard attributes as needed
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false, // Consider setting to true for stronger passwords
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // For dev; consider RETAIN for prod
    });

    const userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool,
      userPoolClientName: 'zik-app-client',
      generateSecret: false, // Recommended for web/mobile apps
      authFlows: {
        adminUserPassword: true, // Enables admin-based password auth
        userPassword: true, // Enables standard user password auth flow
        // custom: true,         // Enable if you have custom auth triggers
      },
      // OAuth settings can be configured here if needed
    });

    // --- DynamoDB Tables with New Composite Key Structure ---

    // Goals Table - New structure with composite key
    const goalsTable = new dynamodb.Table(this, 'GoalsTable', {
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'goalId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Tasks Table - New structure with composite key
    const tasksTable = new dynamodb.Table(this, 'TasksTable', {
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'taskId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Keep userId-dueDate-index GSI for date-based queries
    const tasksUserDueDateIndexName = 'userId-dueDate-index';
    tasksTable.addGlobalSecondaryIndex({
      indexName: tasksUserDueDateIndexName,
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'dueDate', type: dynamodb.AttributeType.STRING },
    });

    // Users Table - Enhanced structure with uniqueness indexes
    const usersTable = new dynamodb.Table(this, 'UsersTable', {
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Note: GSIs will be added in a separate deployment step to avoid conflicts
    // Add Global Secondary Index for username uniqueness - Deploy separately
    // usersTable.addGlobalSecondaryIndex({
    //   indexName: 'username-index',
    //   partitionKey: { name: 'username', type: dynamodb.AttributeType.STRING },
    //   projectionType: dynamodb.ProjectionType.KEYS_ONLY,
    // });

    // Add Global Secondary Index for email uniqueness - Deploy in second update
    // usersTable.addGlobalSecondaryIndex({
    //   indexName: 'email-index',
    //   partitionKey: { name: 'email', type: dynamodb.AttributeType.STRING },
    //   projectionType: dynamodb.ProjectionType.KEYS_ONLY,
    // });

    // RecurrenceRules Table - New table
    const recurrenceRulesTable = new dynamodb.Table(
      this,
      'RecurrenceRulesTable',
      {
        partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
        sortKey: {
          name: 'recurrenceRuleId',
          type: dynamodb.AttributeType.STRING,
        },
        billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }
    );

    // ChatMessages Table - New table for chat history persistence
    const chatMessagesTable = new dynamodb.Table(this, 'ChatMessagesTable', {
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      // Enable TTL for automatic cleanup of old messages
      timeToLiveAttribute: 'ttl',
    });

    // Milestones Table - New table for roadmap milestones
    const milestonesTable = new dynamodb.Table(this, 'MilestonesTable', {
      partitionKey: { name: 'epicId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sequence', type: dynamodb.AttributeType.NUMBER },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // --- Single Lambda Function for Quest Management ---
    const lambdaBaseDir = path.join(__dirname, '../lambda');

    const commonLambdaProps: Partial<NodejsFunctionProps> = {
      runtime: lambda.Runtime.NODEJS_20_X,
      bundling: {
        externalModules: ['@aws-sdk/*'],
        minify: false,
        sourceMap: false,
      },
      timeout: cdk.Duration.seconds(10),
    };

    // Single Lambda to handle quest management (goals and tasks)
    const manageQuestsHandler = new NodejsFunction(
      this,
      'ManageQuestsHandler',
      {
        ...commonLambdaProps,
        entry: path.join(lambdaBaseDir, 'manageQuests.ts'),
        handler: 'handler',
        environment: {
          GOALS_TABLE_NAME: goalsTable.tableName,
          TASKS_TABLE_NAME: tasksTable.tableName,
          CHAT_MESSAGES_TABLE_NAME: chatMessagesTable.tableName,
          USERS_TABLE_NAME: usersTable.tableName,
          RECURRENCE_RULES_TABLE_NAME: recurrenceRulesTable.tableName,
          MILESTONES_TABLE_NAME: milestonesTable.tableName,
          USER_ID_DUE_DATE_INDEX: tasksUserDueDateIndexName,
          USER_POOL_ID: userPool.userPoolId,
          USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
          ROADMAP_GENERATOR_WORKFLOW_ARN: '', // Will be set after Step Function creation
          DAILY_QUEST_GENERATOR_LAMBDA_ARN: '', // Will be set after Lambda creation
        },
      }
    );

    // Grant permissions to the single Lambda
    goalsTable.grantReadWriteData(manageQuestsHandler); // Changed to allow delete
    tasksTable.grantReadWriteData(manageQuestsHandler);
    chatMessagesTable.grantReadWriteData(manageQuestsHandler);
    milestonesTable.grantReadWriteData(manageQuestsHandler);

    // Grant Cognito permissions for token verification
    userPool.grant(manageQuestsHandler, 'cognito-idp:GetUser');

    // --- Goals Handler Lambda - Handles goal fetching operations ---
    const manageGoalsHandler = new NodejsFunction(this, 'ManageGoalsHandler', {
      ...commonLambdaProps,
      entry: path.join(__dirname, '../lambda/manageGoals.ts'),
      handler: 'handler',
      environment: {
        GOALS_TABLE_NAME: goalsTable.tableName,
        TASKS_TABLE_NAME: tasksTable.tableName,
        CHAT_MESSAGES_TABLE_NAME: chatMessagesTable.tableName,
        USERS_TABLE_NAME: usersTable.tableName,
        RECURRENCE_RULES_TABLE_NAME: recurrenceRulesTable.tableName,
        MILESTONES_TABLE_NAME: milestonesTable.tableName,
        USER_ID_DUE_DATE_INDEX: tasksUserDueDateIndexName,
        USER_POOL_ID: userPool.userPoolId,
        USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
      },
    });

    // Grant permissions to the goals handler Lambda
    goalsTable.grantReadWriteData(manageGoalsHandler);
    milestonesTable.grantReadWriteData(manageGoalsHandler);

    // Grant Cognito permissions for token verification
    userPool.grant(manageGoalsHandler, 'cognito-idp:GetUser');

    // --- Profile Handler Lambda - Handles profile management operations ---
    const manageProfileHandler = new NodejsFunction(this, 'ManageProfileHandler', {
      ...commonLambdaProps,
      entry: path.join(__dirname, '../lambda/manageProfile.ts'),
      handler: 'handler',
      environment: {
        USERS_TABLE_NAME: usersTable.tableName,
        USER_POOL_ID: userPool.userPoolId,
        USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
      },
    });

    // Grant permissions to the profile handler Lambda
    usersTable.grantReadWriteData(manageProfileHandler);

    // Grant permissions to query the GSI indexes for username and email uniqueness checks
    manageProfileHandler.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'dynamodb:Query'
      ],
      resources: [
        `${usersTable.tableArn}/index/username-index`,
        `${usersTable.tableArn}/index/email-index`
      ]
    }));

    // Grant Cognito permissions for token verification
    userPool.grant(manageProfileHandler, 'cognito-idp:GetUser');

    // Create Cognito JWT Authorizer
    const cognitoAuthorizer = new HttpJwtAuthorizer(
      'CognitoAuthorizer',
      `https://cognito-idp.${this.region}.amazonaws.com/${userPool.userPoolId}`,
      {
        jwtAudience: [userPoolClient.userPoolClientId],
      }
    );

    // --- Simplified API Gateway Routes ---

    // Task Management Routes (Protected with Cognito JWT Authorizer)
    httpApi.addRoutes({
      path: '/tasks',
      methods: [apigatewayv2.HttpMethod.POST],
      integration: new HttpLambdaIntegration(
        'CreateTaskIntegration',
        manageQuestsHandler
      ),
      authorizer: cognitoAuthorizer,
    });

    httpApi.addRoutes({
      path: '/tasks',
      methods: [apigatewayv2.HttpMethod.GET],
      integration: new HttpLambdaIntegration(
        'GetTasksIntegration',
        manageQuestsHandler
      ),
      authorizer: cognitoAuthorizer,
    });

    // DELETE route for task deletion
    httpApi.addRoutes({
      path: '/tasks/{taskId}',
      methods: [apigatewayv2.HttpMethod.DELETE],
      integration: new HttpLambdaIntegration(
        'DeleteTaskIntegration',
        manageQuestsHandler
      ),
      authorizer: cognitoAuthorizer,
    });

    // PUT route for task updates
    httpApi.addRoutes({
      path: '/tasks/{taskId}',
      methods: [apigatewayv2.HttpMethod.PUT],
      integration: new HttpLambdaIntegration(
        'UpdateTaskIntegration',
        manageQuestsHandler
      ),
      authorizer: cognitoAuthorizer,
    });

    // Goals Management Routes (Protected with Cognito JWT Authorizer)
    httpApi.addRoutes({
      path: '/goals',
      methods: [apigatewayv2.HttpMethod.GET],
      integration: new HttpLambdaIntegration(
        'GetGoalsIntegration',
        manageGoalsHandler
      ),
      authorizer: cognitoAuthorizer,
    });
    // Add POST /goals
    httpApi.addRoutes({
      path: '/goals',
      methods: [apigatewayv2.HttpMethod.POST],
      integration: new HttpLambdaIntegration(
        'CreateGoalIntegration',
        manageGoalsHandler
      ),
      authorizer: cognitoAuthorizer,
    });
    // Add PUT /goals/{goalId}
    httpApi.addRoutes({
      path: '/goals/{goalId}',
      methods: [apigatewayv2.HttpMethod.PUT],
      integration: new HttpLambdaIntegration(
        'UpdateGoalIntegration',
        manageGoalsHandler
      ),
      authorizer: cognitoAuthorizer,
    });
    // Add DELETE /goals/{goalId}
    httpApi.addRoutes({
      path: '/goals/{goalId}',
      methods: [apigatewayv2.HttpMethod.DELETE],
      integration: new HttpLambdaIntegration(
        'DeleteGoalIntegration',
        manageGoalsHandler
      ),
      authorizer: cognitoAuthorizer,
    });
    // Add GET /goals/{goalId}/milestones
    httpApi.addRoutes({
      path: '/goals/{goalId}/milestones',
      methods: [apigatewayv2.HttpMethod.GET],
      integration: new HttpLambdaIntegration(
        'GetMilestonesIntegration',
        manageGoalsHandler
      ),
      authorizer: cognitoAuthorizer,
    });

    // --- Profile Management Routes (Protected with Cognito JWT Authorizer) ---

    // GET /profile - Fetch current user's profile
    httpApi.addRoutes({
      path: '/profile',
      methods: [apigatewayv2.HttpMethod.GET],
      integration: new HttpLambdaIntegration(
        'GetProfileIntegration',
        manageProfileHandler
      ),
      authorizer: cognitoAuthorizer,
    });

    // POST /profile - Create/initialize profile
    httpApi.addRoutes({
      path: '/profile',
      methods: [apigatewayv2.HttpMethod.POST],
      integration: new HttpLambdaIntegration(
        'CreateProfileIntegration',
        manageProfileHandler
      ),
      authorizer: cognitoAuthorizer,
    });

    // PUT /profile - Update profile information
    httpApi.addRoutes({
      path: '/profile',
      methods: [apigatewayv2.HttpMethod.PUT],
      integration: new HttpLambdaIntegration(
        'UpdateProfileIntegration',
        manageProfileHandler
      ),
      authorizer: cognitoAuthorizer,
    });

    // PUT /profile/onboarding/complete - Mark onboarding as completed
    httpApi.addRoutes({
      path: '/profile/onboarding/complete',
      methods: [apigatewayv2.HttpMethod.PUT],
      integration: new HttpLambdaIntegration(
        'CompleteOnboardingIntegration',
        manageProfileHandler
      ),
      authorizer: cognitoAuthorizer,
    });

    // --- Chat Handler Lambda - Handles AI-powered chat interactions ---
    const chatHandler = new NodejsFunction(this, 'ChatHandler', {
      ...commonLambdaProps,
      entry: path.join(lambdaBaseDir, '../src/lambda/chatHandler/index.ts'),
      handler: 'handler',
      environment: {
        GOALS_TABLE_NAME: goalsTable.tableName,
        TASKS_TABLE_NAME: tasksTable.tableName,
        CHAT_MESSAGES_TABLE_NAME: chatMessagesTable.tableName,
        USERS_TABLE_NAME: usersTable.tableName,
        RECURRENCE_RULES_TABLE_NAME: recurrenceRulesTable.tableName,
        MILESTONES_TABLE_NAME: milestonesTable.tableName,
        USER_ID_DUE_DATE_INDEX: tasksUserDueDateIndexName,
        USER_POOL_ID: userPool.userPoolId,
        USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
        ROADMAP_GENERATOR_WORKFLOW_ARN: '', // Will be set after Step Function creation
        DAILY_QUEST_GENERATOR_LAMBDA_ARN: '', // Will be set after Lambda creation
      },
    });

    // Grant permissions to the chat handler Lambda
    goalsTable.grantReadWriteData(chatHandler);
    tasksTable.grantReadWriteData(chatHandler);
    chatMessagesTable.grantReadWriteData(chatHandler);
    usersTable.grantReadData(chatHandler);
    recurrenceRulesTable.grantReadWriteData(chatHandler);
    milestonesTable.grantReadWriteData(chatHandler);

    // Grant Cognito permissions for token verification
    userPool.grant(chatHandler, 'cognito-idp:GetUser');

    // Grant Bedrock permissions for AI interactions
    chatHandler.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'bedrock:InvokeModel',
          'bedrock:InvokeModelWithResponseStream',
        ],
        resources: ['*'], // In production, be more specific
      })
    );

    // Chat endpoint for AI-powered conversations
    httpApi.addRoutes({
      path: '/chat',
      methods: [apigatewayv2.HttpMethod.POST],
      integration: new HttpLambdaIntegration('ChatIntegration', chatHandler),
      authorizer: cognitoAuthorizer,
    });

    // --- Chat History Management Lambda - Handles reading and deleting chat history ---
    const manageChatHistoryHandler = new NodejsFunction(this, 'ManageChatHistoryHandler', {
      ...commonLambdaProps,
      entry: path.join(lambdaBaseDir, 'manageChatHistory.ts'),
      handler: 'handler',
      environment: {
        CHAT_MESSAGES_TABLE_NAME: chatMessagesTable.tableName,
        USERS_TABLE_NAME: usersTable.tableName,
        GOALS_TABLE_NAME: goalsTable.tableName,
        TASKS_TABLE_NAME: tasksTable.tableName,
        USER_POOL_ID: userPool.userPoolId,
        USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
      },
    });

    // Grant permissions to the chat history management Lambda
    chatMessagesTable.grantReadWriteData(manageChatHistoryHandler);
    usersTable.grantReadData(manageChatHistoryHandler);
    goalsTable.grantReadData(manageChatHistoryHandler);
    tasksTable.grantReadData(manageChatHistoryHandler);
    userPool.grant(manageChatHistoryHandler, 'cognito-idp:GetUser');

    // Chat history endpoints
    httpApi.addRoutes({
      path: '/chat-history',
      methods: [apigatewayv2.HttpMethod.GET],
      integration: new HttpLambdaIntegration('GetChatHistoryIntegration', manageChatHistoryHandler),
      authorizer: cognitoAuthorizer,
    });

    httpApi.addRoutes({
      path: '/chat-history',
      methods: [apigatewayv2.HttpMethod.DELETE],
      integration: new HttpLambdaIntegration('DeleteChatHistoryIntegration', manageChatHistoryHandler),
      authorizer: cognitoAuthorizer,
    });

    // --- Recurring Task Generator Lambda (Event-Driven) ---
    const recurringTaskGeneratorLambda = new NodejsFunction(
      this,
      'RecurringTaskGenerator',
      {
        ...commonLambdaProps,
        entry: path.join(__dirname, '../src/lambda/recurringTaskGenerator.ts'),
        handler: 'handler',
        environment: {
          RECURRENCE_RULES_TABLE_NAME: recurrenceRulesTable.tableName,
          TASKS_TABLE_NAME: tasksTable.tableName,
          USER_ID_DUE_DATE_INDEX: tasksUserDueDateIndexName,
        },
        timeout: Duration.minutes(2), // Allow more time for processing multiple rules
      }
    );

    // Grant permissions to the recurring task generator Lambda
    recurrenceRulesTable.grantReadData(recurringTaskGeneratorLambda);
    tasksTable.grantWriteData(recurringTaskGeneratorLambda);

    // Create EventBridge rule for daily execution
    const dailyRecurringTaskRule = new events.Rule(
      this,
      'DailyRecurringTaskRule',
      {
        schedule: events.Schedule.cron({
          minute: '0',
          hour: '5', // Runs at 5:00 AM UTC every day
        }),
        description:
          'Triggers the Zik recurring task generator daily at 5:00 AM UTC',
      }
    );

    // Set the Lambda as the target for the EventBridge rule
    dailyRecurringTaskRule.addTarget(
      new targets.LambdaFunction(recurringTaskGeneratorLambda)
    );

    // --- Roadmap Engine Step Function Components ---

    // Roadmap Generator Lambda - generates milestone roadmap using Planner AI
    const roadmapGeneratorLambda = new NodejsFunction(
      this,
      'RoadmapGeneratorLambda',
      {
        ...commonLambdaProps,
        entry: path.join(__dirname, '../src/lambda/roadmapGenerator/index.ts'),
        handler: 'handler',
        environment: {
          CHAT_MESSAGES_TABLE_NAME: chatMessagesTable.tableName,
          GOALS_TABLE_NAME: goalsTable.tableName,
          TASKS_TABLE_NAME: tasksTable.tableName,
          USERS_TABLE_NAME: usersTable.tableName,
          RECURRENCE_RULES_TABLE_NAME: recurrenceRulesTable.tableName,
          MILESTONES_TABLE_NAME: milestonesTable.tableName,
          USER_ID_DUE_DATE_INDEX: tasksUserDueDateIndexName,
          USER_POOL_ID: userPool.userPoolId,
          USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
        },
        timeout: Duration.minutes(3), // Allow more time for AI processing
      }
    );

    // Milestone Saver Lambda - saves generated milestones to database
    const milestoneSaverLambda = new NodejsFunction(
      this,
      'MilestoneSaverLambda',
      {
        ...commonLambdaProps,
        entry: path.join(__dirname, '../src/lambda/milestoneSaver/index.ts'),
        handler: 'handler',
        environment: {
          CHAT_MESSAGES_TABLE_NAME: chatMessagesTable.tableName,
          GOALS_TABLE_NAME: goalsTable.tableName,
          TASKS_TABLE_NAME: tasksTable.tableName,
          USERS_TABLE_NAME: usersTable.tableName,
          RECURRENCE_RULES_TABLE_NAME: recurrenceRulesTable.tableName,
          MILESTONES_TABLE_NAME: milestonesTable.tableName,
          USER_ID_DUE_DATE_INDEX: tasksUserDueDateIndexName,
          USER_POOL_ID: userPool.userPoolId,
          USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
        },
        timeout: Duration.minutes(2),
      }
    );

    // Daily Quest Generator Lambda - generates daily tasks for milestones using Coach AI
    const dailyQuestGeneratorLambda = new NodejsFunction(
      this,
      'DailyQuestGeneratorLambda',
      {
        ...commonLambdaProps,
        entry: path.join(__dirname, '../src/lambda/dailyQuestGenerator/index.ts'),
        handler: 'handler',
        environment: {
          CHAT_MESSAGES_TABLE_NAME: chatMessagesTable.tableName,
          GOALS_TABLE_NAME: goalsTable.tableName,
          TASKS_TABLE_NAME: tasksTable.tableName,
          USERS_TABLE_NAME: usersTable.tableName,
          RECURRENCE_RULES_TABLE_NAME: recurrenceRulesTable.tableName,
          MILESTONES_TABLE_NAME: milestonesTable.tableName,
          USER_ID_DUE_DATE_INDEX: tasksUserDueDateIndexName,
          USER_POOL_ID: userPool.userPoolId,
          USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
        },
        timeout: Duration.minutes(3), // Allow more time for AI processing
      }
    );

    // Grant permissions for roadmap engine Lambdas
    goalsTable.grantReadData(roadmapGeneratorLambda);
    milestonesTable.grantReadWriteData(milestoneSaverLambda);
    goalsTable.grantReadWriteData(milestoneSaverLambda);

    milestonesTable.grantReadData(dailyQuestGeneratorLambda);
    goalsTable.grantReadData(dailyQuestGeneratorLambda);
    tasksTable.grantWriteData(dailyQuestGeneratorLambda);

    // Grant Bedrock permissions for AI-powered Lambdas
    roadmapGeneratorLambda.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'bedrock:InvokeModel',
          'bedrock:InvokeModelWithResponseStream',
        ],
        resources: ['*'],
      })
    );

    dailyQuestGeneratorLambda.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'bedrock:InvokeModel',
          'bedrock:InvokeModelWithResponseStream',
        ],
        resources: ['*'],
      })
    );

    // Define Step Function State Machine for Roadmap Generation Workflow
    const generateRoadmapTask = new stepfunctionsTasks.LambdaInvoke(this, 'GenerateRoadmapTask', {
      lambdaFunction: roadmapGeneratorLambda,
      resultPath: '$.roadmapResult',
    });

    const saveMilestonesTask = new stepfunctionsTasks.LambdaInvoke(this, 'SaveMilestonesTask', {
      lambdaFunction: milestoneSaverLambda,
      inputPath: '$.roadmapResult.Payload',
      resultPath: '$.saveResult',
    });

    const generateInitialQuestsTask = new stepfunctionsTasks.LambdaInvoke(this, 'GenerateInitialQuestsTask', {
      lambdaFunction: dailyQuestGeneratorLambda,
      inputPath: '$.saveResult.Payload',
      resultPath: '$.questsResult',
    });

    // Define the workflow chain
    const definition = generateRoadmapTask
      .next(saveMilestonesTask)
      .next(generateInitialQuestsTask);

    // Create the Step Function State Machine
    const roadmapGeneratorWorkflow = new stepfunctions.StateMachine(this, 'RoadmapGeneratorWorkflow', {
      definition,
      timeout: Duration.minutes(15), // Overall workflow timeout
    });

    // Grant the Step Function permission to invoke the Lambdas
    roadmapGeneratorLambda.grantInvoke(roadmapGeneratorWorkflow);
    milestoneSaverLambda.grantInvoke(roadmapGeneratorWorkflow);
    dailyQuestGeneratorLambda.grantInvoke(roadmapGeneratorWorkflow);

    // Grant chatHandler permission to start the Step Function
    roadmapGeneratorWorkflow.grantStartExecution(chatHandler);
    roadmapGeneratorWorkflow.grantStartExecution(manageQuestsHandler);

    // Update environment variables with ARNs (using addEnvironment after creation)
    chatHandler.addEnvironment('ROADMAP_GENERATOR_WORKFLOW_ARN', roadmapGeneratorWorkflow.stateMachineArn);
    chatHandler.addEnvironment('DAILY_QUEST_GENERATOR_LAMBDA_ARN', dailyQuestGeneratorLambda.functionArn);

    // Add environment variables to manageQuestsHandler as well
    manageQuestsHandler.addEnvironment('ROADMAP_GENERATOR_WORKFLOW_ARN', roadmapGeneratorWorkflow.stateMachineArn);
    manageQuestsHandler.addEnvironment('DAILY_QUEST_GENERATOR_LAMBDA_ARN', dailyQuestGeneratorLambda.functionArn);

    // Grant chatHandler permission to invoke the daily quest generator directly
    dailyQuestGeneratorLambda.grantInvoke(chatHandler);

    // Grant manageQuestsHandler permission to invoke the daily quest generator directly
    dailyQuestGeneratorLambda.grantInvoke(manageQuestsHandler);

    // --- CDK Outputs ---
    new cdk.CfnOutput(this, 'ApiEndpointOutput', {
      value: httpApi.url!,
      description: 'API Gateway endpoint URL',
    });

    new cdk.CfnOutput(this, 'GoalsTableNameOutput', {
      value: goalsTable.tableName,
      description: 'Goals DynamoDB table name',
    });

    new cdk.CfnOutput(this, 'TasksTableNameOutput', {
      value: tasksTable.tableName,
      description: 'Tasks DynamoDB table name',
    });

    new cdk.CfnOutput(this, 'UsersTableNameOutput', {
      value: usersTable.tableName,
      description: 'Users DynamoDB table name',
    });

    new cdk.CfnOutput(this, 'RecurrenceRulesTableNameOutput', {
      value: recurrenceRulesTable.tableName,
      description: 'RecurrenceRules DynamoDB table name',
    });

    new cdk.CfnOutput(this, 'ChatMessagesTableNameOutput', {
      value: chatMessagesTable.tableName,
      description: 'ChatMessages DynamoDB table name',
    });

    new cdk.CfnOutput(this, 'MilestonesTableNameOutput', {
      value: milestonesTable.tableName,
      description: 'Milestones DynamoDB table name',
    });

    new cdk.CfnOutput(this, 'UserPoolIdOutput', {
      value: userPool.userPoolId,
      description: 'Cognito User Pool ID',
    });

    new cdk.CfnOutput(this, 'UserPoolClientIdOutput', {
      value: userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID',
    });

    new cdk.CfnOutput(this, 'RoadmapGeneratorWorkflowArnOutput', {
      value: roadmapGeneratorWorkflow.stateMachineArn,
      description: 'Roadmap Generator Step Function ARN',
    });

    new cdk.CfnOutput(this, 'DailyQuestGeneratorLambdaArnOutput', {
      value: dailyQuestGeneratorLambda.functionArn,
      description: 'Daily Quest Generator Lambda ARN',
    });
  }
}
