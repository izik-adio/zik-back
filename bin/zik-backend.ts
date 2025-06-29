#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { ZikBackendStack } from '../lib/zik-backend-stack';

const app = new cdk.App();
new ZikBackendStack(app, 'ZikBackendStack', {
  // Use environment variables for deployment configuration
  // This allows different developers to use their own AWS accounts
  env: { 
    account: process.env.CDK_DEFAULT_ACCOUNT, 
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1' 
  },

  /* For more information, see https://docs.aws.amazon.com/cdk/latest/guide/environments.html */
});