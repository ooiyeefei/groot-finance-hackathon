import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as cw_actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import { Construct } from 'constructs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '../../.env.local') });

function generateEnvHash(envVars: Record<string, string>): string {
  const sorted = Object.keys(envVars).sort().map(k => `${k}=${envVars[k]}`).join('|');
  return crypto.createHash('sha256').update(sorted).digest('hex').substring(0, 8);
}

export class DigitalSignatureStack extends cdk.Stack {
  public readonly signingFunction: NodejsFunction;
  public readonly signingAlias: lambda.Alias;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ========================================================================
    // CloudWatch Log Group with 30-day retention
    // ========================================================================
    const logGroup = new logs.LogGroup(this, 'DigitalSignatureLogs', {
      logGroupName: '/aws/lambda/finanseal-digital-signature',
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ========================================================================
    // Lambda Environment Variables
    // ========================================================================
    const lambdaEnvVars: Record<string, string> = {
      SIGNING_ENVIRONMENT: 'production',
      NODE_OPTIONS: '--enable-source-maps',
    };

    // ========================================================================
    // Digital Signature Lambda Function
    // ========================================================================
    this.signingFunction = new NodejsFunction(this, 'DigitalSignatureFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../../src/lambda/digital-signature/handler.ts'),
      handler: 'handler',
      functionName: 'finanseal-digital-signature',
      description: 'Groot Finance LHDN e-Invoice digital signature service — signs and validates UBL 2.1 JSON documents',
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
    // IAM: SSM Parameter Store read access
    // ========================================================================
    this.signingFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ssm:GetParameter'],
        resources: [
          `arn:aws:ssm:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:parameter/finanseal/*/digital-signature/*`,
        ],
      })
    );

    // ========================================================================
    // IAM: CloudWatch PutMetricData for certificate expiry monitoring
    // ========================================================================
    this.signingFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['cloudwatch:PutMetricData'],
        resources: ['*'],
        conditions: {
          StringEquals: {
            'cloudwatch:namespace': 'FinanSEAL/DigitalSignature',
          },
        },
      })
    );

    // ========================================================================
    // Lambda Version and Alias
    // ========================================================================
    const currentVersion = this.signingFunction.currentVersion;
    const envHash = generateEnvHash(lambdaEnvVars);

    this.signingAlias = new lambda.Alias(this, 'ProdAlias', {
      aliasName: 'prod',
      version: currentVersion,
      description: `Production alias (env: ${envHash})`,
    });

    // ========================================================================
    // Vercel OIDC Invocation Permission
    // ========================================================================
    const vercelOidcRoleArn = 'arn:aws:iam::837224017779:role/FinanSEAL-Vercel-S3-Role';

    this.signingAlias.addPermission('VercelOidcInvoke', {
      principal: new iam.ArnPrincipal(vercelOidcRoleArn),
      action: 'lambda:InvokeFunction',
    });

    // ========================================================================
    // Certificate Expiry Alarm (US4)
    // ========================================================================
    const alertTopic = new sns.Topic(this, 'CertExpiryAlertTopic', {
      topicName: 'finanseal-cert-expiry-alerts',
      displayName: 'Groot Finance Certificate Expiry Alerts',
    });

    const expiryMetric = new cloudwatch.Metric({
      namespace: 'FinanSEAL/DigitalSignature',
      metricName: 'CertificateExpiryDays',
      statistic: 'Minimum',
      period: cdk.Duration.hours(24),
    });

    const expiryAlarm = new cloudwatch.Alarm(this, 'CertExpiryAlarm', {
      alarmName: 'finanseal-cert-expiry-30-days',
      alarmDescription: 'Signing certificate expires within 30 days',
      metric: expiryMetric,
      threshold: 30,
      evaluationPeriods: 1,
      comparisonOperator:
        cloudwatch.ComparisonOperator.LESS_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    expiryAlarm.addAlarmAction(new cw_actions.SnsAction(alertTopic));

    // ========================================================================
    // Outputs
    // ========================================================================
    new cdk.CfnOutput(this, 'FunctionArn', {
      value: this.signingFunction.functionArn,
      description: 'Digital Signature Lambda function ARN',
      exportName: `${id}-FunctionArn`,
    });

    new cdk.CfnOutput(this, 'AliasArn', {
      value: this.signingAlias.functionArn,
      description: 'Digital Signature Lambda alias ARN',
      exportName: `${id}-AliasArn`,
    });

    new cdk.CfnOutput(this, 'LogGroupName', {
      value: logGroup.logGroupName,
      description: 'Digital Signature Lambda log group',
      exportName: `${id}-LogGroupName`,
    });

    new cdk.CfnOutput(this, 'AlertTopicArn', {
      value: alertTopic.topicArn,
      description: 'Certificate expiry alert SNS topic ARN',
      exportName: `${id}-AlertTopicArn`,
    });
  }
}
