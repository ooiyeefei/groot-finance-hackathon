#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { CdnStack } from '../lib/cdn-stack';

const app = new cdk.App();

new CdnStack(app, 'FinansealCdnStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'us-west-2', // Same region as S3 bucket
  },
  description: 'Groot Finance CloudFront CDN for private document delivery',
});
