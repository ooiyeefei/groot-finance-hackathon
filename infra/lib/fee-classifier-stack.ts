import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '../../.env.local') });

function generateEnvHash(envVars: Record<string, string>): string {
  const sorted = Object.keys(envVars).sort().map(k => `${k}=${envVars[k]}`).join('|');
  return crypto.createHash('sha256').update(sorted).digest('hex').substring(0, 8);
}

export class FeeClassifierStack extends cdk.Stack {
  public readonly feeClassifierFunction: lambda.DockerImageFunction;
  public readonly feeClassifierAlias: lambda.Alias;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Reference existing S3 bucket for model storage
    const bucket = s3.Bucket.fromBucketName(
      this,
      'FinansealBucket',
      'finanseal-bucket'
    );

    // CloudWatch Log Group with 30-day retention
    const logGroup = new logs.LogGroup(this, 'FeeClassifierLogs', {
      logGroupName: '/aws/lambda/finanseal-fee-classifier',
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Get Gemini API key from SSM
    const geminiApiKey = ssm.StringParameter.valueForStringParameter(
      this,
      '/finanseal/gemini-api-key'
    );

    // Get MCP internal service key from SSM
    const mcpServiceKey = ssm.StringParameter.valueForStringParameter(
      this,
      '/finanseal/mcp-internal-service-key'
    );

    // Environment variables
    const envVars: Record<string, string> = {
      GEMINI_API_KEY: geminiApiKey,
      MCP_INTERNAL_SERVICE_KEY: mcpServiceKey,
      S3_BUCKET: 'finanseal-bucket',
      SENTRY_DSN: process.env.SENTRY_DSN ?? '',
    };

    // Docker-based Python Lambda (ARM_64 for cost optimization)
    this.feeClassifierFunction = new lambda.DockerImageFunction(this, 'FeeClassifierFunction', {
      functionName: 'finanseal-fee-classifier',
      code: lambda.DockerImageCode.fromImageAsset(
        path.join(__dirname, '../../src/lambda/fee-classifier-python'),
        {
          buildArgs: {
            ENV_HASH: generateEnvHash(envVars),
          },
        }
      ),
      architecture: lambda.Architecture.X86_64,
      memorySize: 512,
      timeout: cdk.Duration.minutes(15), // 15 min for MIPROv2 optimization
      environment: envVars,
      logGroup,
      description: 'DSPy fee classification — Tier 2 AI classification + MIPROv2 optimization',
    });

    // Grant S3 read/write for model state files
    bucket.grantRead(this.feeClassifierFunction, 'dspy-models/*');
    bucket.grantPut(this.feeClassifierFunction, 'dspy-models/*');

    // Create alias for stable invocation
    const version = this.feeClassifierFunction.currentVersion;
    this.feeClassifierAlias = new lambda.Alias(this, 'FeeClassifierAlias', {
      aliasName: 'live',
      version,
    });

    // Grant Vercel OIDC role permission to invoke
    const vercelRole = iam.Role.fromRoleArn(
      this,
      'VercelOIDCRole',
      'arn:aws:iam::837224017779:role/FinanSEAL-Vercel-S3-Role'
    );

    this.feeClassifierAlias.addPermission('AllowVercelInvoke', {
      principal: vercelRole,
      action: 'lambda:InvokeFunction',
    });

    // Outputs
    new cdk.CfnOutput(this, 'FeeClassifierFunctionArn', {
      value: this.feeClassifierFunction.functionArn,
      description: 'Fee Classifier Lambda ARN',
    });

    new cdk.CfnOutput(this, 'FeeClassifierAliasArn', {
      value: this.feeClassifierAlias.functionArn,
      description: 'Fee Classifier Lambda Alias ARN',
    });
  }
}
