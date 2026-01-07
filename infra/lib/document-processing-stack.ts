import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables from parent project's .env.local
dotenv.config({ path: path.join(__dirname, '../../.env.local') });

export class DocumentProcessingStack extends cdk.Stack {
  public readonly documentProcessorFunction: lambda.DockerImageFunction;
  public readonly documentProcessorAlias: lambda.Alias;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ========================================================================
    // Reference existing S3 bucket
    // ========================================================================
    const bucket = s3.Bucket.fromBucketName(
      this,
      'FinansealBucket',
      'finanseal-bucket'
    );

    // ========================================================================
    // CloudWatch Log Group with 30-day retention
    // ========================================================================
    const logGroup = new logs.LogGroup(this, 'DocumentProcessorLogs', {
      logGroupName: `/aws/lambda/finanseal-document-processor`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ========================================================================
    // Document Processor Lambda Function - Docker Container with Durable Execution
    //
    // Uses AWS Durable Functions for fault-tolerant workflows:
    // - Automatic checkpointing after each step
    // - Up to 24-hour execution time
    // - Survives Lambda restarts and cold starts
    //
    // Container includes: Python 3.11, DSPy, Poppler, Sentry, Durable SDK
    // ========================================================================
    this.documentProcessorFunction = new lambda.DockerImageFunction(this, 'DocumentProcessor', {
      code: lambda.DockerImageCode.fromImageAsset(
        path.join(__dirname, '../../src/lambda/document-processor-python'),
        {
          // Build arguments for Docker
          buildArgs: {
            // Can pass build-time args if needed
          },
        }
      ),
      functionName: 'finanseal-document-processor',
      description: 'Document processing with DSPy extraction and AWS Durable Functions (Python 3.11)',
      memorySize: 1024,
      timeout: cdk.Duration.minutes(15), // Lambda timeout (durable config extends this)
      architecture: lambda.Architecture.X86_64,
      logGroup,
      // AWS Durable Functions configuration
      // Enables checkpointing for long-running workflows
      durableConfig: {
        executionTimeout: cdk.Duration.hours(1), // Up to 1 hour for document processing
        retentionPeriod: cdk.Duration.days(1),   // Retain execution history for 1 day
      },
      environment: {
        // Sentry error tracking
        SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN || '',
        SENTRY_ENVIRONMENT: 'production',
        // Convex - use PROD_CONVEX_URL for production
        NEXT_PUBLIC_CONVEX_URL: process.env.PROD_CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL || '',
        // Gemini API key for DSPy
        GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
        // S3 bucket name
        S3_BUCKET_NAME: 'finanseal-bucket',
        // Note: AWS_REGION is set automatically by Lambda runtime
        // Poppler path in container (installed via yum)
        POPPLER_PATH: '/usr/bin',
      },
    });

    // ========================================================================
    // IAM Permissions
    // ========================================================================

    // S3 read/write permissions
    bucket.grantReadWrite(this.documentProcessorFunction);

    // ========================================================================
    // Lambda Version and Alias
    // ========================================================================
    const version = this.documentProcessorFunction.currentVersion;

    this.documentProcessorAlias = new lambda.Alias(this, 'ProdAlias', {
      aliasName: 'prod',
      version,
      description: 'Production alias for document processor with durable execution',
    });

    // ========================================================================
    // Vercel OIDC Invocation Permission
    // ========================================================================
    // Allow the Vercel OIDC role to invoke this Lambda via alias
    const vercelOidcRoleArn = 'arn:aws:iam::837224017779:role/FinanSEAL-Vercel-S3-Role';

    this.documentProcessorAlias.addPermission('VercelOidcInvoke', {
      principal: new iam.ArnPrincipal(vercelOidcRoleArn),
      action: 'lambda:InvokeFunction',
    });

    // ========================================================================
    // Outputs
    // ========================================================================
    new cdk.CfnOutput(this, 'FunctionArn', {
      value: this.documentProcessorFunction.functionArn,
      description: 'Lambda function ARN',
      exportName: `${id}-FunctionArn`,
    });

    new cdk.CfnOutput(this, 'AliasArn', {
      value: this.documentProcessorAlias.functionArn,
      description: 'Lambda alias ARN for Vercel invocation',
      exportName: `${id}-AliasArn`,
    });

    new cdk.CfnOutput(this, 'LogGroupName', {
      value: logGroup.logGroupName,
      description: 'CloudWatch Log Group name',
      exportName: `${id}-LogGroupName`,
    });
  }
}
