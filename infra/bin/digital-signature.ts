#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { DigitalSignatureStack } from '../lib/digital-signature-stack';

const app = new cdk.App();

new DigitalSignatureStack(app, 'FinansealDigitalSignature', {
  env: {
    account: '837224017779',
    region: 'us-west-2',
  },
  description: 'FinanSEAL LHDN e-Invoice digital signature service',
  tags: {
    Environment: 'production',
    Project: 'finanseal',
    Feature: 'digital-signature',
  },
});
