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

    // Users Table - Simplified structure using userId as PK
    const usersTable = new dynamodb.Table(this, 'UsersTable', {
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

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
          USER_ID_DUE_DATE_INDEX: tasksUserDueDateIndexName,
          USER_POOL_ID: userPool.userPoolId,
          USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
        },
      }
    );

    // Grant permissions to the single Lambda
    goalsTable.grantReadWriteData(manageQuestsHandler); // Changed to allow delete
    tasksTable.grantReadWriteData(manageQuestsHandler);
    chatMessagesTable.grantReadWriteData(manageQuestsHandler);

    // Grant Cognito permissions for token verification
    userPool.grant(manageQuestsHandler, 'cognito-idp:GetUser');

    // Create Cognito JWT Authorizer
    const cognitoAuthorizer = new HttpJwtAuthorizer(
      'CognitoAuthorizer',
      `https://cognito-idp.${this.region}.amazonaws.com/${userPool.userPoolId}`,
      {
        jwtAudience: [userPoolClient.userPoolClientId],
      }
    );

    // --- Simplified API Gateway Routes ---

    // Quest Management Routes (Protected with Cognito JWT Authorizer)
    httpApi.addRoutes({
      path: '/quests',
      methods: [apigatewayv2.HttpMethod.POST],
      integration: new HttpLambdaIntegration(
        'CreateQuestIntegration',
        manageQuestsHandler
      ),
      authorizer: cognitoAuthorizer,
    });

    httpApi.addRoutes({
      path: '/quests',
      methods: [apigatewayv2.HttpMethod.GET],
      integration: new HttpLambdaIntegration(
        'GetQuestsIntegration',
        manageQuestsHandler
      ),
      authorizer: cognitoAuthorizer,
    });

    // DELETE route for quest deletion
    httpApi.addRoutes({
      path: '/quests/{questId}',
      methods: [apigatewayv2.HttpMethod.DELETE],
      integration: new HttpLambdaIntegration(
        'DeleteQuestIntegration',
        manageQuestsHandler
      ),
      authorizer: cognitoAuthorizer,
    });

    // PUT route for quest updates
    httpApi.addRoutes({
      path: '/quests/{questId}',
      methods: [apigatewayv2.HttpMethod.PUT],
      integration: new HttpLambdaIntegration(
        'UpdateQuestIntegration',
        manageQuestsHandler
      ),
      authorizer: cognitoAuthorizer,
    });

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

    new cdk.CfnOutput(this, 'UserPoolIdOutput', {
      value: userPool.userPoolId,
      description: 'Cognito User Pool ID',
    });

    new cdk.CfnOutput(this, 'UserPoolClientIdOutput', {
      value: userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID',
    });
  }
}
