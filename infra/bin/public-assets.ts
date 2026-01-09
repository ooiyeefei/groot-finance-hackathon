#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { PublicAssetsStack } from '../lib/public-assets-stack';

const app = new cdk.App();

// Deploy public assets bucket
new PublicAssetsStack(app, 'FinansealPublicAssets', {
  env: {
    account: '837224017779',
    region: 'us-west-2',
  },
  description: 'FinanSEAL Public Assets Bucket for favicon, logos, and static files',
  tags: {
    Environment: 'production',
    Project: 'finanseal',
    Feature: 'public-assets',
  },
});
