import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import {
  NodejsFunction,
  NodejsFunctionProps,
} from 'aws-cdk-lib/aws-lambda-nodejs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import {
  HttpLambdaAuthorizer,
  HttpLambdaResponseType,
} from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as path from 'path';
import { Duration } from 'aws-cdk-lib';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager'; // Added import
import * as cognito from 'aws-cdk-lib/aws-cognito'; // Import Cognito

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

    // Goals Table
    const goalsTable = new dynamodb.Table(this, 'GoalsTable', {
      partitionKey: { name: 'goalId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // For dev; consider RETAIN for prod
    });

    goalsTable.addGlobalSecondaryIndex({
      indexName: 'userId-index', // Used by getGoals.ts
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
    });

    // Tasks Table
    const tasksTable = new dynamodb.Table(this, 'TasksTable', {
      partitionKey: { name: 'taskId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // For dev; consider RETAIN for prod
    });

    const tasksUserDueDateIndexName = 'userId-dueDate-index'; // Used by getTasksByDate.ts
    tasksTable.addGlobalSecondaryIndex({
      indexName: tasksUserDueDateIndexName,
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'dueDate', type: dynamodb.AttributeType.STRING },
    });

    // New GSI for querying all tasks of a user
    const tasksUserIdIndexName = 'userId-tasks-index';
    tasksTable.addGlobalSecondaryIndex({
      indexName: tasksUserIdIndexName,
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
    });

    // Users Table for Authentication
    const usersTable = new dynamodb.Table(this, 'UsersTable', {
      partitionKey: { name: 'email', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // For dev; consider RETAIN for prod
      stream: dynamodb.StreamViewType.NEW_IMAGE, // Example: if you need to react to user changes
    });

    // Add a Global Secondary Index for verification token lookup
    usersTable.addGlobalSecondaryIndex({
      indexName: 'VerificationTokenIndex',
      partitionKey: {
        name: 'verificationToken',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Add a Global Secondary Index for password reset token lookup
    usersTable.addGlobalSecondaryIndex({
      indexName: 'PasswordResetTokenIndex',
      partitionKey: {
        name: 'passwordResetToken',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL, // Or .KEYS_ONLY or .INCLUDE as needed
    });

    // --- Lambda Function Definitions ---
    const lambdaBaseDir = path.join(__dirname, '../lambda');

    const commonLambdaProps: Partial<NodejsFunctionProps> = {
      runtime: lambda.Runtime.NODEJS_20_X, // Updated from NODEJS_18_X
      bundling: {
        externalModules: ['@aws-sdk/*'],
        minify: false,
        sourceMap: false,
      },
      timeout: cdk.Duration.seconds(10), // Default is 3s, tests are taking time.
    };

    const createLambdaFn = (
      name: string,
      handlerFile: string,
      environment: { [key: string]: string },
      tableGrants: {
        table: dynamodb.Table;
        grantActions: ('read' | 'write' | 'readWrite')[];
      }[]
    ) => {
      const lambdaFunction = new NodejsFunction(this, name, {
        ...commonLambdaProps,
        entry: path.join(lambdaBaseDir, handlerFile),
        handler: 'handler',
        environment: {
          ...environment,
          // Removed Cognito variables
        },
      });

      tableGrants.forEach((tg) => {
        tg.grantActions.forEach((action) => {
          if (action === 'read') tg.table.grantReadData(lambdaFunction);
          else if (action === 'write') tg.table.grantWriteData(lambdaFunction);
          else if (action === 'readWrite')
            tg.table.grantReadWriteData(lambdaFunction);
        });
      });

      // Grant Cognito permissions
      // userPool.grant(lambdaFunction, 'cognito-idp:AdminGetUser');
      // userPool.grant(lambdaFunction, 'cognito-idp:AdminUpdateUserAttributes');

      return lambdaFunction;
    };

    // --- Create Lambda Functions ---
    const createGoalHandler = createLambdaFn(
      'CreateGoalHandler',
      'createGoal.ts',
      {
        GOALS_TABLE_NAME: goalsTable.tableName,
      },
      [{ table: goalsTable, grantActions: ['write'] }]
    );
    const getGoalHandler = createLambdaFn(
      'GetGoalHandler',
      'getGoal.ts',
      {
        GOALS_TABLE_NAME: goalsTable.tableName,
      },
      [{ table: goalsTable, grantActions: ['read'] }]
    );
    const getGoalsHandler = createLambdaFn(
      'GetGoalsHandler',
      'getGoals.ts',
      {
        GOALS_TABLE_NAME: goalsTable.tableName,
        USER_ID_INDEX: 'userId-index',
      },
      [{ table: goalsTable, grantActions: ['read'] }]
    );
    const updateGoalHandler = createLambdaFn(
      'UpdateGoalHandler',
      'updateGoal.ts',
      {
        GOALS_TABLE_NAME: goalsTable.tableName,
      },
      [{ table: goalsTable, grantActions: ['readWrite'] }]
    );
    const deleteGoalHandler = createLambdaFn(
      'DeleteGoalHandler',
      'deleteGoal.ts',
      {
        GOALS_TABLE_NAME: goalsTable.tableName,
      },
      [{ table: goalsTable, grantActions: ['readWrite'] }]
    );

    const createTaskHandler = createLambdaFn(
      'CreateTaskHandler',
      'createTask.ts',
      {
        TASKS_TABLE_NAME: tasksTable.tableName,
      },
      [{ table: tasksTable, grantActions: ['write'] }]
    );
    const getTaskHandler = createLambdaFn(
      'GetTaskHandler',
      'getTask.ts',
      {
        TASKS_TABLE_NAME: tasksTable.tableName,
      },
      [{ table: tasksTable, grantActions: ['read'] }]
    );
    const getTasksByUserHandler = createLambdaFn(
      'GetTasksByUserHandler',
      'getTasksByUser.ts',
      {
        TASKS_TABLE_NAME: tasksTable.tableName,
        USER_ID_INDEX: tasksUserIdIndexName,
      },
      [{ table: tasksTable, grantActions: ['read'] }]
    );
    const getTasksByDateHandler = createLambdaFn(
      'GetTasksByDateHandler',
      'getTasksByDate.ts',
      {
        TASKS_TABLE_NAME: tasksTable.tableName,
        USER_ID_DUE_DATE_INDEX: tasksUserDueDateIndexName,
      },
      [{ table: tasksTable, grantActions: ['read'] }]
    );
    const updateTaskHandler = createLambdaFn(
      'UpdateTaskHandler',
      'updateTask.ts',
      {
        TASKS_TABLE_NAME: tasksTable.tableName,
      },
      [{ table: tasksTable, grantActions: ['readWrite'] }]
    );
    const deleteTaskHandler = createLambdaFn(
      'DeleteTaskHandler',
      'deleteTask.ts',
      {
        TASKS_TABLE_NAME: tasksTable.tableName,
      },
      [{ table: tasksTable, grantActions: ['readWrite'] }]
    );

    // --- Authentication Lambda Functions ---
    const registerUserHandler = new NodejsFunction(
      this,
      'RegisterUserHandler',
      {
        ...commonLambdaProps,
        entry: path.join(lambdaBaseDir, 'registerUser.ts'),
        handler: 'handler',
        environment: {
          USERS_TABLE_NAME: usersTable.tableName,
          EMAIL_FROM_ADDRESS: 'zik-support@dynofx.com',
          API_GATEWAY_URL: httpApi.url!, // Correct: httpApi is now defined
          JWT_SECRET_ARN: jwtSecret.secretArn,
          USER_POOL_ID: userPool.userPoolId, // Correct: userPool is now defined
          USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId, // Correct: userPoolClient is now defined
          RELAX_RATE_LIMITS: 'true', // Enable relaxed rate limits for all environments for now
        },
      }
    );
    usersTable.grantReadWriteData(registerUserHandler);
    jwtSecret.grantRead(registerUserHandler);
    registerUserHandler.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ses:SendEmail', 'ses:SendRawEmail'],
        resources: ['*'], // Restrict this if possible
      })
    );
    // Grant Cognito permissions if this Lambda directly interacts with Cognito for user creation beyond standard sign-up
    // For a custom DB approach, direct Cognito user creation permissions might not be needed here if Cognito is only for auth tokens post-DB registration.
    // If registerUser.ts is supposed to create users in Cognito (e.g. AdminCreateUser), grant here:
    // userPool.grant(registerUserHandler, 'cognito-idp:AdminCreateUser', 'cognito-idp:AdminSetUserPassword');

    const loginUserHandler = new NodejsFunction(this, 'LoginUserHandler', {
      ...commonLambdaProps,
      entry: path.join(lambdaBaseDir, 'loginUser.ts'),
      handler: 'handler',
      environment: {
        USERS_TABLE_NAME: usersTable.tableName,
        JWT_SECRET_ARN: jwtSecret.secretArn,
        USER_POOL_ID: userPool.userPoolId, // Correct
        USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId, // Correct
        RELAX_RATE_LIMITS: 'true', // Enable relaxed rate limits for all environments for now
      },
    });
    usersTable.grantReadWriteData(loginUserHandler);
    jwtSecret.grantRead(loginUserHandler);
    // Grant permissions for Cognito to initiate auth flows
    userPool.grant(
      loginUserHandler,
      'cognito-idp:InitiateAuth',
      'cognito-idp:AdminInitiateAuth'
    );

    const refreshTokenHandler = new NodejsFunction(
      this,
      'RefreshTokenHandler',
      {
        ...commonLambdaProps,
        entry: path.join(lambdaBaseDir, 'refreshToken.ts'),
        handler: 'handler',
        environment: {
          USERS_TABLE_NAME: usersTable.tableName,
          JWT_SECRET_ARN: jwtSecret.secretArn,
          USER_POOL_ID: userPool.userPoolId, // Correct
          USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId, // Correct
        },
      }
    );
    usersTable.grantReadWriteData(refreshTokenHandler);
    jwtSecret.grantRead(refreshTokenHandler);
    userPool.grant(refreshTokenHandler, 'cognito-idp:InitiateAuth');

    const logoutUserHandler = new NodejsFunction(this, 'LogoutUserHandler', {
      ...commonLambdaProps,
      entry: path.join(lambdaBaseDir, 'logoutUser.ts'),
      handler: 'handler',
      environment: {
        USERS_TABLE_NAME: usersTable.tableName,
        JWT_SECRET_ARN: jwtSecret.secretArn,
        USER_POOL_ID: userPool.userPoolId, // Correct
        USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId, // Correct
      },
    });
    usersTable.grantReadWriteData(logoutUserHandler);
    jwtSecret.grantRead(logoutUserHandler);
    // If logout involves global sign out or token revocation in Cognito:
    // userPool.grant(logoutUserHandler, 'cognito-idp:GlobalSignOut', 'cognito-idp:RevokeToken');

    const verifyEmailHandler = new NodejsFunction(this, 'VerifyEmailHandler', {
      ...commonLambdaProps,
      entry: path.join(lambdaBaseDir, 'verifyEmail.ts'),
      handler: 'handler',
      environment: {
        USERS_TABLE_NAME: usersTable.tableName,
        USER_POOL_ID: userPool.userPoolId, // Correct
        USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId, // Correct
      },
    });
    usersTable.grantReadWriteData(verifyEmailHandler);
    jwtSecret.grantRead(verifyEmailHandler); // If verifyEmail needs JWT for some reason (unlikely)
    // Grant permissions to confirm sign-up in Cognito
    userPool.grant(
      verifyEmailHandler,
      'cognito-idp:ConfirmSignUp',
      'cognito-idp:AdminConfirmSignUp'
    );

    // Define Lambda for the API Gateway Authorizer
    const authLambda = new lambda.Function(this, 'AuthLambda', {
      runtime: lambda.Runtime.NODEJS_LATEST, // Updated to NODEJS_LATEST from NODEJS_20_X for consistency or specific need
      handler: 'index.handler', // Ensure this handler exists in the specified code path
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/auth')), // Ensure this path is correct
      environment: {
        JWT_SECRET_ARN: jwtSecret.secretArn,
        USER_POOL_ID: userPool.userPoolId, // Correct
        USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId, // Correct
      },
      timeout: Duration.seconds(10),
    });
    jwtSecret.grantRead(authLambda);
    // The authorizer Lambda typically verifies a token; it might not need direct Cognito call permissions
    // unless it's fetching user details from Cognito based on the token for authorization logic.
    // If so, grant necessary permissions like 'cognito-idp:GetUser'.

    const authorizer = new HttpLambdaAuthorizer(
      'LambdaAuthorizer',
      authLambda,
      {
        responseTypes: [HttpLambdaResponseType.SIMPLE],
      }
    );

    // --- API Gateway Integrations ---

    // --- Authentication Routes ---
    // Public auth routes (NO Cognito authorizer)
    httpApi.addRoutes({
      path: '/auth/register',
      methods: [apigatewayv2.HttpMethod.POST],
      integration: new HttpLambdaIntegration(
        'RegisterUserIntegration',
        registerUserHandler
      ),
    });

    httpApi.addRoutes({
      path: '/auth/login',
      methods: [apigatewayv2.HttpMethod.POST],
      integration: new HttpLambdaIntegration(
        'LoginUserIntegration',
        loginUserHandler
      ),
    });

    httpApi.addRoutes({
      path: '/auth/refresh',
      methods: [apigatewayv2.HttpMethod.POST],
      integration: new HttpLambdaIntegration(
        'RefreshTokenIntegration',
        refreshTokenHandler
      ),
      // No authorizer, as it relies on the refresh token itself
    });

    httpApi.addRoutes({
      path: '/auth/verify-email',
      methods: [apigatewayv2.HttpMethod.GET],
      integration: new HttpLambdaIntegration(
        'VerifyEmailIntegration',
        verifyEmailHandler
      ),
      // No authorizer needed for email verification
    });

    // Protected auth routes (uses Cognito authorizer)
    httpApi.addRoutes({
      path: '/auth/logout',
      methods: [apigatewayv2.HttpMethod.POST],
      integration: new HttpLambdaIntegration(
        'LogoutUserIntegration',
        logoutUserHandler
      ),
      // authorizer: cognitoAuthorizer, // Requires a valid access token to logout
    });

    // Goals (Protected with Cognito)
    httpApi.addRoutes({
      path: '/goals',
      methods: [apigatewayv2.HttpMethod.POST],
      integration: new HttpLambdaIntegration(
        'CreateGoalIntegration',
        createGoalHandler
      ),
      // authorizer: cognitoAuthorizer,
    });
    httpApi.addRoutes({
      path: '/goals',
      methods: [apigatewayv2.HttpMethod.GET],
      integration: new HttpLambdaIntegration(
        'GetGoalsIntegration',
        getGoalsHandler
      ),
      // authorizer: cognitoAuthorizer,
    });
    httpApi.addRoutes({
      path: '/goals/{goalId}',
      methods: [apigatewayv2.HttpMethod.GET],
      integration: new HttpLambdaIntegration(
        'GetGoalIntegration',
        getGoalHandler
      ),
      // authorizer: cognitoAuthorizer,
    });
    httpApi.addRoutes({
      path: '/goals/{goalId}',
      methods: [apigatewayv2.HttpMethod.PUT],
      integration: new HttpLambdaIntegration(
        'UpdateGoalIntegration',
        updateGoalHandler
      ),
      // authorizer: cognitoAuthorizer,
    });
    httpApi.addRoutes({
      path: '/goals/{goalId}',
      methods: [apigatewayv2.HttpMethod.DELETE],
      integration: new HttpLambdaIntegration(
        'DeleteGoalIntegration',
        deleteGoalHandler
      ),
      // authorizer: cognitoAuthorizer,
    });

    // Tasks (Protected with Cognito)
    httpApi.addRoutes({
      path: '/tasks',
      methods: [apigatewayv2.HttpMethod.POST],
      integration: new HttpLambdaIntegration(
        'CreateTaskIntegration',
        createTaskHandler
      ),
      // authorizer: cognitoAuthorizer,
    });
    httpApi.addRoutes({
      path: '/tasks/{taskId}',
      methods: [apigatewayv2.HttpMethod.GET],
      integration: new HttpLambdaIntegration(
        'GetTaskIntegration',
        getTaskHandler
      ),
      // authorizer: cognitoAuthorizer,
    });
    httpApi.addRoutes({
      path: '/tasks',
      methods: [apigatewayv2.HttpMethod.GET],
      integration: new HttpLambdaIntegration(
        'GetTasksIntegration',
        getTasksByUserHandler
      ),
      // authorizer: cognitoAuthorizer,
    });
    // Add route for getting tasks by date
    httpApi.addRoutes({
      path: '/tasks/date/{dateValue}',
      methods: [apigatewayv2.HttpMethod.GET],
      integration: new HttpLambdaIntegration(
        'GetTasksByDateIntegration',
        getTasksByDateHandler
      ),
      // authorizer: cognitoAuthorizer,
    });
    httpApi.addRoutes({
      path: '/tasks/{taskId}',
      methods: [apigatewayv2.HttpMethod.PUT],
      integration: new HttpLambdaIntegration(
        'UpdateTaskIntegration',
        updateTaskHandler
      ),
      // authorizer: cognitoAuthorizer,
    });
    httpApi.addRoutes({
      path: '/tasks/{taskId}',
      methods: [apigatewayv2.HttpMethod.DELETE],
      integration: new HttpLambdaIntegration(
        'DeleteTaskIntegration',
        deleteTaskHandler
      ),
      // authorizer: cognitoAuthorizer,
    });

    // Auth routes using new Lambda functions
    httpApi.addRoutes({
      path: '/register',
      methods: [apigatewayv2.HttpMethod.POST],
      integration: new HttpLambdaIntegration(
        'RegisterUserIntegration',
        registerUserHandler
      ),
    });

    httpApi.addRoutes({
      path: '/login',
      methods: [apigatewayv2.HttpMethod.POST],
      integration: new HttpLambdaIntegration(
        'LoginUserIntegration',
        loginUserHandler
      ),
    });

    httpApi.addRoutes({
      path: '/verify-email', // Or /verify-email/{token} if you prefer path params
      methods: [apigatewayv2.HttpMethod.GET], // Or POST if it makes more sense for your flow
      integration: new HttpLambdaIntegration(
        'VerifyEmailIntegration',
        verifyEmailHandler
      ),
    });

    // Example of a protected route using the new authorizer
    // const getItemsHandler = new lambda.Function(this, 'GetItemsHandler', { /* ... */ });
    // usersTable.grantReadData(getItemsHandler); // If it needs user data
    // api.addRoutes({
    //   path: '/items',
    //   methods: [apigatewayv2.HttpMethod.GET],
    //   integration: new HttpLambdaIntegration('GetItemsIntegration', getItemsHandler),
    //   authorizer: authorizer, // Apply the new Lambda authorizer
    // });

    // --- CDK Outputs ---
    new cdk.CfnOutput(this, 'ApiEndpointOutput', {
      value: httpApi.url!, // The ! asserts that url will be defined
      description: 'API Gateway endpoint URL',
    });
    new cdk.CfnOutput(this, 'GoalsTableNameOutput', {
      value: goalsTable.tableName,
    });
    new cdk.CfnOutput(this, 'TasksTableNameOutput', {
      value: tasksTable.tableName,
    });
    new cdk.CfnOutput(this, 'UsersTableNameOutput', {
      value: usersTable.tableName,
    });
    new cdk.CfnOutput(this, 'ApiGatewayUrl', {
      value: httpApi.url!, // This will output the base URL of your API Gateway
      description: 'The base URL for the Zik API Gateway',
    });

    // CDK Outputs for Cognito (already defined, ensure they are after UserPool and Client)
    new cdk.CfnOutput(this, 'UserPoolIdOutput', {
      value: userPool.userPoolId,
      description: 'Cognito User Pool ID',
    });
    new cdk.CfnOutput(this, 'UserPoolClientIdOutput', {
      value: userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID',
    });

    // Removed userPoolClient.grantInvoke calls as they are generally not needed
    // when Lambdas are invoked by API Gateway or other services.
    // IAM permissions for Lambdas to *call* Cognito are handled by userPool.grant() or direct IAM policies.
  }
}
