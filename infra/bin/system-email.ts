#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { SystemEmailStack } from '../lib/system-email-stack';

const app = new cdk.App();

new SystemEmailStack(app, 'FinansealSystemEmailStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'us-west-2', // Hardcoded per requirement
  },
  description: 'FinanSEAL transactional email system - Lambda Durable Functions + SES',
});
