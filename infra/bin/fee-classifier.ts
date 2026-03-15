#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { FeeClassifierStack } from '../lib/fee-classifier-stack';

const app = new cdk.App();

new FeeClassifierStack(app, 'FinansealFeeClassifier', {
  env: {
    account: '837224017779',
    region: 'us-west-2',
  },
  description: 'Groot Finance DSPy Fee Classifier — Tier 2 AI classification + MIPROv2 optimization',
  tags: {
    Environment: 'production',
    Project: 'finanseal',
    Feature: 'fee-classifier',
  },
});
