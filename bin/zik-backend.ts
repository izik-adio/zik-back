#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { ZikBackendStack } from '../lib/zik-backend-stack';

const app = new cdk.App();
new ZikBackendStack(app, 'ZikBackendStack', {
  /* Specify the exact Account and Region for deployment */
  env: { account: '468120368975', region: 'us-east-1' },

  /* For more information, see https://docs.aws.amazon.com/cdk/latest/guide/environments.html */
});