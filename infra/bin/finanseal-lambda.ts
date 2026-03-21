#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { DocumentProcessingStack } from '../lib/document-processing-stack';

const app = new cdk.App();

// Deploy document processing stack
new DocumentProcessingStack(app, 'GrootFinanceDocumentProcessing', {
  env: {
    account: '837224017779',
    region: 'us-west-2', // HARDCODED - must match Vercel env vars
  },
  description: 'Groot Finance Document Processing (Python 3.11)',
  tags: {
    Environment: 'production',
    Project: 'groot-finance',
    Feature: 'document-processing',
  },
});
