import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';

// Load environment variables from parent project's .env.local
dotenv.config({ path: path.join(__dirname, '../../.env.local') });

/**
 * Generate a short hash from environment variables to force new Lambda versions
 * when env vars change (CDK only auto-versions on code changes by default)
 */
function generateEnvHash(envVars: Record<string, string>): string {
  const sorted = Object.keys(envVars).sort().map(k => `${k}=${envVars[k]}`).join('|');
  return crypto.createHash('sha256').update(sorted).digest('hex').substring(0, 8);
}

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
    // Lambda Environment Variables
    // ========================================================================
    // Define env vars separately so we can hash them for versioning
    const lambdaEnvVars: Record<string, string> = {
      // Sentry error tracking
      SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN || '',
      SENTRY_ENVIRONMENT: 'production',
      // Convex production URL (hardcoded for reliability)
      NEXT_PUBLIC_CONVEX_URL: 'https://kindhearted-lynx-129.convex.cloud',
      // Gemini API key for DSPy
      GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
      // S3 bucket name
      S3_BUCKET_NAME: 'finanseal-bucket',
      // Note: AWS_REGION is set automatically by Lambda runtime
      // Poppler path in container (installed via yum)
      POPPLER_PATH: '/usr/bin',
    };

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
      environment: lambdaEnvVars,
    });

    // ========================================================================
    // IAM Permissions
    // ========================================================================

    // S3 read/write permissions
    bucket.grantReadWrite(this.documentProcessorFunction);

    // ========================================================================
    // Lambda Version and Alias
    // ========================================================================
    // Use currentVersion which auto-creates new versions when:
    // 1. Docker image changes (code changes)
    // 2. Function configuration changes
    //
    // Note: currentVersion uses a hash of the function configuration,
    // so any code or config change triggers a new version automatically.
    const currentVersion = this.documentProcessorFunction.currentVersion;

    // Generate env hash for tracking purposes (included in alias description)
    const envHash = generateEnvHash(lambdaEnvVars);

    this.documentProcessorAlias = new lambda.Alias(this, 'ProdAlias', {
      aliasName: 'prod',
      version: currentVersion,
      description: `Production alias (env: ${envHash})`,
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
