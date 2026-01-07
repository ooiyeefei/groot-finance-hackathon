#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { DocumentProcessingStack } from '../lib/document-processing-stack';

const app = new cdk.App();

// Deploy document processing stack
new DocumentProcessingStack(app, 'FinansealDocumentProcessing-staging', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT || '837224017779',
    region: process.env.CDK_DEFAULT_REGION || 'us-west-2',
  },
  description: 'FinanSeal Document Processing with AWS Durable Functions (Python 3.11)',
  tags: {
    Environment: 'production',
    Project: 'finanseal',
    Feature: 'document-processing',
  },
});
