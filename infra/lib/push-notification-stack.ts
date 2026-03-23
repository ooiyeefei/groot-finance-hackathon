/**
 * 034-leave-enhance: Push Notification Lambda Stack
 *
 * Sends push notifications via APNs (iOS) and FCM (Android).
 * Reads signing credentials from SSM Parameter Store.
 */

import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import * as path from 'path';

export class PushNotificationStack extends cdk.Stack {
  public readonly pushFunction: NodejsFunction;
  public readonly pushAlias: lambda.Alias;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ========================================================================
    // CloudWatch Log Group with 30-day retention
    // ========================================================================
    const logGroup = new logs.LogGroup(this, 'PushNotificationLogs', {
      logGroupName: '/aws/lambda/finanseal-push-notification',
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ========================================================================
    // FCM Service Account SSM Parameter (placeholder — set manually)
    // ========================================================================
    new ssm.StringParameter(this, 'FcmServiceAccountPlaceholder', {
      parameterName: '/finanseal/prod/fcm-service-account',
      stringValue: 'PLACEHOLDER_REPLACE_WITH_FCM_SERVICE_ACCOUNT_JSON',
      description: 'Firebase Cloud Messaging service account JSON. Replace via CLI as SecureString.',
      tier: ssm.ParameterTier.STANDARD,
    });

    // ========================================================================
    // Lambda Environment Variables
    // ========================================================================
    const lambdaEnvVars: Record<string, string> = {
      NODE_OPTIONS: '--enable-source-maps',
      APNS_BUNDLE_ID: 'com.hellogroot.finance',
    };

    // ========================================================================
    // Push Notification Lambda Function
    // ========================================================================
    this.pushFunction = new NodejsFunction(this, 'PushNotificationFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../../src/lambda/push-notification/index.ts'),
      handler: 'handler',
      functionName: 'finanseal-push-notification',
      description: 'Groot Finance push notification service — sends via APNs (iOS) and FCM (Android)',
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      architecture: lambda.Architecture.ARM_64,
      logGroup,
      environment: lambdaEnvVars,
      bundling: {
        minify: true,
        sourceMap: true,
        target: 'node20',
        externalModules: ['@aws-sdk/*'],
        format: OutputFormat.CJS,
      },
    });

    // ========================================================================
    // IAM: SSM Parameter Store read access for APNs + FCM credentials
    // ========================================================================
    this.pushFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ssm:GetParameter'],
        resources: [
          `arn:aws:ssm:${this.region}:${this.account}:parameter/finanseal/prod/apns-*`,
          `arn:aws:ssm:${this.region}:${this.account}:parameter/finanseal/prod/fcm-*`,
        ],
      }),
    );

    // ========================================================================
    // Lambda Alias (for Vercel OIDC invocation)
    // ========================================================================
    this.pushAlias = new lambda.Alias(this, 'PushNotificationAlias', {
      aliasName: 'live',
      version: this.pushFunction.currentVersion,
    });

    // Grant Vercel OIDC role permission to invoke
    const vercelOidcRoleArn = 'arn:aws:iam::837224017779:role/FinanSEAL-Vercel-S3-Role';
    this.pushAlias.addPermission('VercelInvoke', {
      principal: new iam.ArnPrincipal(vercelOidcRoleArn),
      action: 'lambda:InvokeFunction',
    });

    // ========================================================================
    // Outputs
    // ========================================================================
    new cdk.CfnOutput(this, 'PushNotificationFunctionArn', {
      value: this.pushFunction.functionArn,
      description: 'Push notification Lambda function ARN',
    });

    new cdk.CfnOutput(this, 'PushNotificationAliasArn', {
      value: this.pushAlias.functionArn,
      description: 'Push notification Lambda alias ARN (for invocation)',
    });
  }
}
