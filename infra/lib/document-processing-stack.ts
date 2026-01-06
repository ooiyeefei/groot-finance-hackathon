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
  public readonly documentProcessorFunction: lambda.Function;
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
    // Python dependencies Lambda Layer
    // ========================================================================
    const pythonPdfLayer = new lambda.LayerVersion(this, 'PythonPdfLayer', {
      code: lambda.Code.fromAsset(
        path.join(__dirname, '../../src/lambda/layers/python-pdf/dist'),
        {
          // If dist doesn't exist, use the source directory for synth validation
          // In production, dist should be built via Docker before deploy
        }
      ),
      compatibleRuntimes: [lambda.Runtime.NODEJS_22_X],
      compatibleArchitectures: [lambda.Architecture.ARM_64],
      description: 'pdf2image, Pillow, poppler-utils for PDF processing',
      layerVersionName: 'finanseal-python-pdf',
    });

    // ========================================================================
    // CloudWatch Log Group with 30-day retention
    // ========================================================================
    const logGroup = new logs.LogGroup(this, 'DocumentProcessorLogs', {
      logGroupName: `/aws/lambda/finanseal-document-processor`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ========================================================================
    // Document Processor Lambda Function
    // ========================================================================
    this.documentProcessorFunction = new lambda.Function(this, 'DocumentProcessor', {
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(
        path.join(__dirname, '../../src/lambda/document-processor/dist')
      ),
      functionName: 'finanseal-document-processor',
      description: 'Document processing durable function with checkpointing',
      memorySize: 1024,
      timeout: cdk.Duration.minutes(15), // Per-invocation timeout
      layers: [pythonPdfLayer],
      logGroup,
      environment: {
        NODE_ENV: 'production',
        // Lambda uses SENTRY_DSN, but .env.local has NEXT_PUBLIC_SENTRY_DSN
        SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN || '',
        SENTRY_ENVIRONMENT: 'production',
        // Use PROD_CONVEX_URL for production Lambda (not NEXT_PUBLIC_CONVEX_URL which is DEV)
        NEXT_PUBLIC_CONVEX_URL: process.env.PROD_CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL || '',
        GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
        S3_BUCKET_NAME: 'finanseal-bucket',
        AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1',
      },
      // Durable execution configuration (Lambda Durable Functions)
      // Note: This requires the durable execution feature to be enabled
      // durableConfig: {
      //   executionTimeout: cdk.Duration.hours(1),
      //   retentionPeriod: cdk.Duration.days(30),
      // },
    });

    // ========================================================================
    // IAM Permissions
    // ========================================================================

    // S3 read/write permissions
    bucket.grantReadWrite(this.documentProcessorFunction);

    // Durable execution checkpoint permissions
    // Note: Using '*' resource to avoid circular dependency with function ARN
    // This is safe because the actions are Lambda-specific
    this.documentProcessorFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'lambda:CheckpointDurableExecutions',
          'lambda:GetDurableExecutionState',
        ],
        resources: ['*'],
      })
    );

    // ========================================================================
    // Lambda Version and Alias
    // ========================================================================
    const version = this.documentProcessorFunction.currentVersion;

    this.documentProcessorAlias = new lambda.Alias(this, 'ProdAlias', {
      aliasName: 'prod',
      version,
      description: 'Production alias for document processor',
    });

    // ========================================================================
    // Vercel OIDC Invocation Permission
    // ========================================================================
    // Allow the Vercel OIDC role to invoke this Lambda via alias
    // Using addPermission (resource-based policy) instead of grantInvoke (IAM policy)
    // to avoid circular dependency with version/alias chain
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
