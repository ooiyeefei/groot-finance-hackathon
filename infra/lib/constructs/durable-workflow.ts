import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ses from 'aws-cdk-lib/aws-ses';
import * as path from 'path';

export interface DurableWorkflowConstructProps {
  configurationSetName: string;
  emailIdentity: ses.EmailIdentity;
}

/**
 * Lambda Durable Function for Welcome Email Workflow
 *
 * Uses AWS Lambda Durable Functions (December 2025) for:
 * - Long-running workflow orchestration (up to 1 year)
 * - Automatic checkpointing via context.step()
 * - Built-in delays via context.wait()
 *
 * Security:
 * - NO public endpoints (invoke via AWS SDK only)
 * - Least privilege IAM permissions
 * - Checkpoint data encrypted at rest
 */
export class DurableWorkflowConstruct extends Construct {
  public readonly function: NodejsFunction;
  public readonly alias: lambda.Alias;

  constructor(scope: Construct, id: string, props: DurableWorkflowConstructProps) {
    super(scope, id);

    // Lambda execution role with SES and durable function permissions
    const executionRole = new iam.Role(this, 'ExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSLambdaBasicExecutionRole'
        ),
      ],
    });

    // Grant SES send permissions on sender identity
    props.emailIdentity.grantSendEmail(executionRole);

    // In SES sandbox, also need permission to send TO verified recipients
    // This grants permission on all identities in this account (sender + verified recipients)
    // Also need permission on configuration set when using one
    executionRole.addToPolicy(new iam.PolicyStatement({
      actions: ['ses:SendEmail', 'ses:SendRawEmail'],
      resources: [
        `arn:aws:ses:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:identity/*`,
        `arn:aws:ses:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:configuration-set/${props.configurationSetName}`,
      ],
    }));

    // Create Lambda Durable Function using NodejsFunction for TypeScript bundling
    this.function = new NodejsFunction(this, 'Function', {
      entry: path.join(__dirname, '../../../lambda/welcome-workflow/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      functionName: 'finanseal-welcome-workflow',
      memorySize: 256,
      role: executionRole,
      environment: {
        CONVEX_URL: 'https://kindhearted-lynx-129.convex.cloud',
        SES_CONFIGURATION_SET: props.configurationSetName,
        SES_FROM_EMAIL: 'noreply@notifications.hellogroot.com',
        APP_URL: 'https://finance.hellogroot.com/en',
        // For unsubscribe token generation (JWT signing)
        // Must match EMAIL_UNSUBSCRIBE_SECRET in Vercel for token verification
        EMAIL_UNSUBSCRIBE_SECRET: process.env.EMAIL_UNSUBSCRIBE_SECRET || '',
        NODE_ENV: 'production',
      },
      description: 'Welcome email workflow - Lambda Durable Function',
      // Bundling configuration for TypeScript
      bundling: {
        minify: false, // Keep readable for debugging
        sourceMap: true, // Enable source maps for stack traces
        // The durable execution SDK is provided by the Lambda Durable runtime
        // Don't bundle it - it's available at runtime via nodejs:22.DurableFunction.v8
        externalModules: ['@aws/durable-execution-sdk-js'],
      },
      // Durable Function configuration
      // executionTimeout: max time for a single execution before checkpoint
      // retentionPeriod: how long to retain durable execution state
      durableConfig: {
        executionTimeout: cdk.Duration.hours(1),
        retentionPeriod: cdk.Duration.days(30),
      },
    });

    // Add checkpoint permissions for durable execution
    // Required for context.step() checkpointing and state retrieval
    // Use Aws pseudo-parameters to avoid circular dependency (role -> function -> role)
    // while ensuring correct account/region at deployment time
    const durableFunctionArn = `arn:aws:lambda:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:function:finanseal-welcome-workflow`;
    executionRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'lambda:CheckpointDurableExecution',
        'lambda:GetDurableExecutionState',
      ],
      resources: [
        `${durableFunctionArn}*`,  // Matches :VERSION/durable-execution/...
      ],
    }));

    // Create version and alias for stable invocation
    const version = this.function.currentVersion;
    this.alias = new lambda.Alias(this, 'ProdAlias', {
      aliasName: 'prod',
      version: version,
    });

    // Output function alias ARN (use this for invocation)
    new cdk.CfnOutput(this, 'FunctionAliasArn', {
      value: this.alias.functionArn,
      description: 'Welcome Workflow Lambda Alias ARN - use this for invocation',
    });

    new cdk.CfnOutput(this, 'FunctionArn', {
      value: this.function.functionArn,
      description: 'Welcome Workflow Lambda ARN',
    });
  }
}
