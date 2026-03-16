import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNode from 'aws-cdk-lib/aws-lambda-nodejs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as ses from 'aws-cdk-lib/aws-ses';
import * as sesActions from 'aws-cdk-lib/aws-ses-actions';
import * as cr from 'aws-cdk-lib/custom-resources';
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
    // E-Invoice Form Fill Lambda (019-lhdn-einv-flow-2)
    // Node.js Lambda that uses Stagehand + Browserbase to fill merchant forms
    // Triggered by: Python document-processor (boto3) or Vercel API (OIDC)
    // ========================================================================
    const formFillLogGroup = new logs.LogGroup(this, 'FormFillLogs', {
      logGroupName: `/aws/lambda/finanseal-einvoice-form-fill`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const formFillFunction = new lambda.DockerImageFunction(this, 'EinvoiceFormFill', {
      code: lambda.DockerImageCode.fromImageAsset(
        path.join(__dirname, '../../src/lambda/einvoice-form-fill-python'),
      ),
      architecture: lambda.Architecture.X86_64,
      functionName: 'finanseal-einvoice-form-fill',
      description: 'E-Invoice form fill — Python + Playwright + Gemini CUA (3-tier self-evolving)',
      memorySize: 2048, // Playwright Chromium needs more memory in Docker
      timeout: cdk.Duration.minutes(8), // Long forms (MR. D.I.Y. = 20+ fields) need up to 7 min
      logGroup: formFillLogGroup,
      environment: {
        GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
        NEXT_PUBLIC_CONVEX_URL: 'https://kindhearted-lynx-129.convex.cloud',
        PLAYWRIGHT_BROWSERS_PATH: '/opt/pw-browsers',
      },
    });

    // CapSolver API key (SSM SecureString) — read at runtime, not baked into env
    const capsolverParam = ssm.StringParameter.fromSecureStringParameterAttributes(this, 'CapsolverKey', {
      parameterName: '/finanseal/capsolver-api-key',
    });
    capsolverParam.grantRead(formFillFunction);
    formFillFunction.addEnvironment('CAPSOLVER_SSM_PARAM', '/finanseal/capsolver-api-key');

    // Browserbase credentials (SSM) — read at runtime, not baked into env
    // This prevents CDK deploys from overwriting credentials with stale .env.local values
    const bbApiKeyParam = ssm.StringParameter.fromSecureStringParameterAttributes(this, 'BrowserbaseApiKey', {
      parameterName: '/finanseal/browserbase-api-key',
    });
    const bbProjectIdParam = ssm.StringParameter.fromStringParameterAttributes(this, 'BrowserbaseProjectId', {
      parameterName: '/finanseal/browserbase-project-id',
    });
    bbApiKeyParam.grantRead(formFillFunction);
    bbProjectIdParam.grantRead(formFillFunction);
    formFillFunction.addEnvironment('BROWSERBASE_API_KEY_SSM_PARAM', '/finanseal/browserbase-api-key');
    formFillFunction.addEnvironment('BROWSERBASE_PROJECT_ID_SSM_PARAM', '/finanseal/browserbase-project-id');

    // Merchant login credentials (SSM) — e.g. /finanseal/7eleven-einvoice-email
    formFillFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['ssm:GetParameters', 'ssm:GetParameter'],
      resources: [
        `arn:aws:ssm:${this.region}:${this.account}:parameter/finanseal/*-einvoice-email`,
        `arn:aws:ssm:${this.region}:${this.account}:parameter/finanseal/*-einvoice-password`,
      ],
    }));

    // Form fill Lambda needs S3 read (receipt images for CUA) + write (download-einvoice saves PDFs)
    bucket.grantReadWrite(formFillFunction);

    // Grant Python Lambda permission to invoke the form fill Lambda
    formFillFunction.grantInvoke(this.documentProcessorFunction);

    // Pass form fill Lambda ARN to Python Lambda as env var
    this.documentProcessorFunction.addEnvironment(
      'EINVOICE_FORM_FILL_LAMBDA_ARN',
      formFillFunction.functionArn
    );

    // Allow Vercel OIDC role to invoke form fill Lambda (for manual requests)
    formFillFunction.addPermission('VercelOidcInvoke', {
      principal: new iam.ArnPrincipal(vercelOidcRoleArn),
      action: 'lambda:InvokeFunction',
    });

    // ========================================================================
    // E-Invoice Form Fill — browser-use + Gemini Flash (Tier 2B)
    // Fully async Lambda — no nest_asyncio conflicts.
    // Invoked by the main form-fill Lambda when CUA hits 429 rate limit.
    // ========================================================================
    const formFillBuLogGroup = new logs.LogGroup(this, 'FormFillBuLogs', {
      logGroupName: `/aws/lambda/finanseal-einvoice-form-fill-bu`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const formFillBuFunction = new lambda.DockerImageFunction(this, 'EinvoiceFormFillBU', {
      code: lambda.DockerImageCode.fromImageAsset(
        path.join(__dirname, '../../src/lambda/einvoice-form-fill-browser-use'),
      ),
      architecture: lambda.Architecture.X86_64,
      functionName: 'finanseal-einvoice-form-fill-bu',
      description: 'E-Invoice form fill — browser-use + Gemini Flash (Tier 2B, CUA 429 fallback)',
      memorySize: 2048,
      timeout: cdk.Duration.minutes(5),
      logGroup: formFillBuLogGroup,
      environment: {
        GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
        NEXT_PUBLIC_CONVEX_URL: 'https://kindhearted-lynx-129.convex.cloud',
        PLAYWRIGHT_BROWSERS_PATH: '/opt/pw-browsers',
      },
    });

    // browser-use Lambda also needs S3 read for receipt images
    bucket.grantRead(formFillBuFunction);

    // Main form-fill Lambda can invoke browser-use Lambda
    formFillBuFunction.grantInvoke(formFillFunction);

    // Pass browser-use Lambda ARN to main form-fill Lambda
    formFillFunction.addEnvironment(
      'EINVOICE_FORM_FILL_BU_LAMBDA_ARN',
      formFillBuFunction.functionArn
    );

    // ========================================================================
    // LHDN Polling Lambda (019-lhdn-einv-flow-2)
    // Node.js Lambda that polls LHDN MyInvois API for received e-invoices.
    // Each business has their own LHDN credentials (entered via business settings UI):
    //   - Client ID: stored in Convex (lhdnClientId field)
    //   - Client Secret: stored in SSM (/groot-finance/businesses/{id}/lhdn-client-secret)
    // Lambda reads per-business credentials from SSM at runtime.
    // Triggered by: EventBridge (every 5 min) or direct invocation
    // ========================================================================
    const lhdnPollLogGroup = new logs.LogGroup(this, 'LhdnPollLogs', {
      logGroupName: `/aws/lambda/finanseal-lhdn-polling`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const lhdnPollFunction = new lambdaNode.NodejsFunction(this, 'LhdnPolling', {
      entry: path.join(__dirname, '../../src/lambda/lhdn-polling/handler.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64, // Cost-optimized
      functionName: 'finanseal-lhdn-polling',
      description: 'LHDN MyInvois polling — per-business SSM creds, fetch received docs, Convex matching (019-lhdn-einv-flow-2)',
      memorySize: 256,
      timeout: cdk.Duration.minutes(2), // Polling + enrichment typically <30s
      logGroup: lhdnPollLogGroup,
      environment: {
        NEXT_PUBLIC_CONVEX_URL: 'https://kindhearted-lynx-129.convex.cloud',
        LHDN_API_BASE_URL: process.env.LHDN_API_BASE_URL || 'https://preprod-api.myinvois.hasil.gov.my',
      },
      bundling: {
        externalModules: ['@aws-sdk/*'], // Use runtime-provided SDK
        minify: true,
        sourceMap: true,
      },
    });

    // IAM: Read per-business LHDN client secret from SSM Parameter Store
    lhdnPollFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['ssm:GetParameter'],
      resources: [
        `arn:aws:ssm:${this.region}:${this.account}:parameter/groot-finance/businesses/*/lhdn-client-secret`,
      ],
    }));

    // Allow Vercel OIDC role to invoke LHDN polling Lambda (for on-demand polling)
    lhdnPollFunction.addPermission('VercelOidcInvoke', {
      principal: new iam.ArnPrincipal(vercelOidcRoleArn),
      action: 'lambda:InvokeFunction',
    });

    // ========================================================================
    // EventBridge: Schedule LHDN polling every 5 minutes (019-lhdn-einv-flow-2)
    //
    // Lambda self-discovers businesses with pending e-invoice requests by
    // querying Convex, then polls LHDN for each. No Convex cron or Vercel
    // middleware needed — purely AWS-native scheduling.
    //
    // Cost: EventBridge rules are free tier (up to 14M invocations/month).
    // Lambda cost: ~$0 when no businesses have pending requests (< 1s runtime).
    // ========================================================================
    const lhdnPollSchedule = new events.Rule(this, 'LhdnPollSchedule', {
      ruleName: 'finanseal-lhdn-poll-schedule',
      description: 'Trigger LHDN polling Lambda every 5 minutes (019-lhdn-einv-flow-2)',
      schedule: events.Schedule.rate(cdk.Duration.minutes(5)),
    });

    lhdnPollSchedule.addTarget(new targets.LambdaFunction(lhdnPollFunction));

    // ========================================================================
    // E-Invoice Email Processor Lambda (019-lhdn-einv-flow-2)
    // Processes incoming merchant e-invoice emails received via SES.
    // SES stores raw email in S3 → triggers this Lambda → parses MIME →
    // extracts PDF attachment → saves to S3 under expense claim → updates Convex.
    //
    // Email format: einvoice+{ref}@einv.hellogroot.com
    // MX record: einv.hellogroot.com → inbound-smtp.us-west-2.amazonaws.com
    // ========================================================================
    const emailProcessorLogGroup = new logs.LogGroup(this, 'EinvoiceEmailProcessorLogs', {
      logGroupName: '/aws/lambda/finanseal-einvoice-email-processor',
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const emailProcessorFunction = new lambdaNode.NodejsFunction(this, 'EinvoiceEmailProcessor', {
      entry: path.join(__dirname, '../../src/lambda/einvoice-email-processor/handler.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      functionName: 'finanseal-einvoice-email-processor',
      description: 'Process incoming merchant e-invoice emails from SES — Gemini Flash classification (019-lhdn-einv-flow-2)',
      memorySize: 256,
      timeout: cdk.Duration.seconds(120), // Gemini classification + optional Playwright PDF download via form-fill Lambda
      logGroup: emailProcessorLogGroup,
      environment: {
        NEXT_PUBLIC_CONVEX_URL: 'https://kindhearted-lynx-129.convex.cloud',
        S3_BUCKET_NAME: 'finanseal-bucket',
        GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
        RESEND_API_KEY: process.env.RESEND_API_KEY || '',
        EINVOICE_FORM_FILL_LAMBDA_ARN: formFillFunction.functionArn,
      },
      bundling: {
        externalModules: ['@aws-sdk/*'],
        nodeModules: ['mailparser'],  // Native module — must be installed in bundle, not esbuild-bundled
        minify: true,
        sourceMap: true,
      },
    });

    // S3 read/write: read raw email from SES bucket, write processed files to main bucket
    bucket.grantReadWrite(emailProcessorFunction);

    // Allow email processor to invoke form-fill Lambda for Playwright PDF downloads
    formFillFunction.grantInvoke(emailProcessorFunction);

    // SES send permission: forward e-invoice emails to user
    emailProcessorFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ses:SendRawEmail'],
      resources: ['*'], // SES requires * for SendRawEmail
    }));

    // Also need read access to the SES email bucket (may be same bucket or different)
    // SES stores raw emails in the same bucket under ses-emails/einvoice/ prefix

    // ========================================================================
    // SES Receiving: einv.hellogroot.com (019-lhdn-einv-flow-2)
    //
    // Prerequisites (manual DNS):
    // - MX record: einv → inbound-smtp.us-west-2.amazonaws.com (priority 10)
    //
    // Cost: Free (first 1,000 emails/month), then $0.10 per 1,000
    // ========================================================================
    const receiptRuleSet = new ses.ReceiptRuleSet(this, 'EinvoiceReceiptRuleSet', {
      receiptRuleSetName: 'finanseal-einvoice-receipt',
    });

    receiptRuleSet.addRule('EinvoiceReceiptRule', {
      recipients: ['einv.hellogroot.com'],
      actions: [
        new sesActions.S3({
          bucket,
          objectKeyPrefix: 'ses-emails/einvoice/',
        }),
        new sesActions.Lambda({
          function: emailProcessorFunction,
        }),
      ],
    });

    // ========================================================================
    // S3 Lifecycle: SES Email Retention (PDPA compliance)
    //
    // Delete raw SES emails after 90 days. These are incoming e-invoice emails
    // stored at ses-emails/einvoice/ — the Lambda processor extracts data to
    // Convex, so the raw emails are only needed for short-term debugging.
    // ========================================================================
    new cr.AwsCustomResource(this, 'SesEmailLifecycleRule', {
      onCreate: {
        service: 'S3',
        action: 'putBucketLifecycleConfiguration',
        parameters: {
          Bucket: 'finanseal-bucket',
          LifecycleConfiguration: {
            Rules: [
              {
                ID: 'ses-email-90-day-cleanup',
                Filter: { Prefix: 'ses-emails/' },
                Status: 'Enabled',
                Expiration: { Days: 90 },
              },
            ],
          },
        },
        physicalResourceId: cr.PhysicalResourceId.of('ses-email-lifecycle-v1'),
      },
      onUpdate: {
        service: 'S3',
        action: 'putBucketLifecycleConfiguration',
        parameters: {
          Bucket: 'finanseal-bucket',
          LifecycleConfiguration: {
            Rules: [
              {
                ID: 'ses-email-90-day-cleanup',
                Filter: { Prefix: 'ses-emails/' },
                Status: 'Enabled',
                Expiration: { Days: 90 },
              },
            ],
          },
        },
        physicalResourceId: cr.PhysicalResourceId.of('ses-email-lifecycle-v1'),
      },
      policy: cr.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: ['s3:PutLifecycleConfiguration', 's3:GetLifecycleConfiguration'],
          resources: ['arn:aws:s3:::finanseal-bucket'],
        }),
      ]),
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

    // ========================================================================
    // DSPy Optimizer Lambda (001-dspy-cua-optimization)
    // Runs MIPROv2 + BootstrapFewShot optimization every 3 days
    // Uses same Docker image as form fill (shares dspy_modules/ + optimization/)
    // ========================================================================
    const optimizerLogGroup = new logs.LogGroup(this, 'DspyOptimizerLogs', {
      logGroupName: `/aws/lambda/finanseal-dspy-optimizer`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const optimizerFunction = new lambda.DockerImageFunction(this, 'DspyOptimizer', {
      code: lambda.DockerImageCode.fromImageAsset(
        path.join(__dirname, '../../src/lambda/einvoice-form-fill-python'),
        {
          cmd: ['optimization_handler.handler'],  // Override handler to use optimizer
        }
      ),
      architecture: lambda.Architecture.X86_64,
      functionName: 'finanseal-dspy-optimizer',
      description: 'DSPy optimization pipeline — MIPROv2 troubleshooter + BootstrapFewShot recon (every 3 days)',
      memorySize: 1024,
      timeout: cdk.Duration.minutes(15),  // Optimization can take several minutes
      logGroup: optimizerLogGroup,
      environment: {
        GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
        NEXT_PUBLIC_CONVEX_URL: 'https://kindhearted-lynx-129.convex.cloud',
        S3_BUCKET_NAME: 'finanseal-bucket',
        DSPY_CACHEDIR: '/tmp/dspy_cache',
        // Tuneable optimization frequency (stored here for visibility, EventBridge controls actual schedule)
        OPTIMIZATION_FREQUENCY_DAYS: '3',
      },
    });

    // S3 read/write for dspy-modules/
    bucket.grantReadWrite(optimizerFunction);

    // EventBridge rule: every 3 days
    const optimizerRule = new events.Rule(this, 'DspyOptimizerSchedule', {
      ruleName: 'finanseal-dspy-optimizer-schedule',
      schedule: events.Schedule.rate(cdk.Duration.days(3)),
      description: 'Trigger DSPy optimization pipeline every 3 days (001-dspy-cua-optimization)',
    });
    optimizerRule.addTarget(new targets.LambdaFunction(optimizerFunction));

    new cdk.CfnOutput(this, 'DspyOptimizerArn', {
      value: optimizerFunction.functionArn,
      description: 'DSPy optimizer Lambda ARN',
    });

    new cdk.CfnOutput(this, 'FormFillFunctionArn', {
      value: formFillFunction.functionArn,
      description: 'E-Invoice form fill Lambda ARN',
      exportName: `${id}-FormFillFunctionArn`,
    });

    new cdk.CfnOutput(this, 'LhdnPollFunctionArn', {
      value: lhdnPollFunction.functionArn,
      description: 'LHDN polling Lambda ARN',
      exportName: `${id}-LhdnPollFunctionArn`,
    });

    new cdk.CfnOutput(this, 'EinvoiceEmailProcessorArn', {
      value: emailProcessorFunction.functionArn,
      description: 'E-Invoice email processor Lambda ARN',
      exportName: `${id}-EinvoiceEmailProcessorArn`,
    });
  }
}
