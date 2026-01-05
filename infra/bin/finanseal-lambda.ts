#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { DocumentProcessingStack } from '../lib/document-processing-stack';

const app = new cdk.App();

// Get environment from context
const environment = app.node.tryGetContext('environment') || 'staging';
const envConfig = app.node.tryGetContext(environment);

if (!envConfig) {
  throw new Error(`Environment configuration not found for: ${environment}`);
}

const stackName = `FinansealDocumentProcessing${envConfig.stackNameSuffix || ''}`;

new DocumentProcessingStack(app, stackName, {
  env: {
    account: envConfig.accountId || process.env.CDK_DEFAULT_ACCOUNT,
    region: envConfig.region || process.env.CDK_DEFAULT_REGION,
  },
  description: `FinanSeal Document Processing Lambda Durable Functions (${environment})`,
  tags: {
    Environment: environment,
    Project: 'finanseal',
    Feature: 'document-processing',
  },
});
