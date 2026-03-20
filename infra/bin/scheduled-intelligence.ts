#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { ScheduledIntelligenceStack } from '../lib/scheduled-intelligence-stack';

const app = new cdk.App();

// Deploy scheduled intelligence stack
new ScheduledIntelligenceStack(app, 'FinansealScheduledIntelligence-staging', {
  env: {
    account: '837224017779',
    region: 'us-west-2', // HARDCODED - must match Vercel env vars
  },
  description: 'FinanSeal Scheduled Intelligence - EventBridge migration from Convex crons',
  tags: {
    Environment: 'production',
    Project: 'finanseal',
    Feature: 'scheduled-intelligence',
  },
});
