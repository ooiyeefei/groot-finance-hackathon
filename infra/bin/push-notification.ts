#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { PushNotificationStack } from '../lib/push-notification-stack';

const app = new cdk.App();

new PushNotificationStack(app, 'FinansealPushNotification', {
  env: {
    account: '837224017779',
    region: 'us-west-2',
  },
  description: 'Groot Finance push notification service — APNs (iOS) + FCM (Android)',
  tags: {
    Environment: 'production',
    Project: 'finanseal',
    Feature: 'push-notification',
  },
});
