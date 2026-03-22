import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ssm from 'aws-cdk-lib/aws-ssm';
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

export interface MCPServerStackProps extends cdk.StackProps {
  /**
   * The Convex deployment URL
   */
  convexUrl?: string;
}

export class MCPServerStack extends cdk.Stack {
  public readonly mcpServerFunction: NodejsFunction;
  public readonly mcpServerAlias: lambda.Alias;
  public readonly mcpApiEndpoint: string;

  constructor(scope: Construct, id: string, props?: MCPServerStackProps) {
    super(scope, id, props);

    // ========================================================================
    // CloudWatch Log Group with 30-day retention
    // ========================================================================
    const logGroup = new logs.LogGroup(this, 'MCPServerLogs', {
      logGroupName: `/aws/lambda/finanseal-mcp-server`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ========================================================================
    // Lambda Environment Variables
    // ========================================================================
    const lambdaEnvVars: Record<string, string> = {
      // Convex production URL
      NEXT_PUBLIC_CONVEX_URL: props?.convexUrl || process.env.NEXT_PUBLIC_CONVEX_URL || 'https://kindhearted-lynx-129.convex.cloud',
      // Internal service key for Layer 2 service-to-service calls (Convex → MCP)
      // Read from MCP_INTERNAL_SERVICE_KEY env var at synth time.
      // Set before deploy: export MCP_INTERNAL_SERVICE_KEY=$(aws ssm get-parameter --name /finanseal/mcp/internal-service-key --with-decryption --query Parameter.Value --output text --profile groot-finanseal --region us-west-2)
      ...(process.env.MCP_INTERNAL_SERVICE_KEY ? { MCP_INTERNAL_SERVICE_KEY: process.env.MCP_INTERNAL_SERVICE_KEY } : {}),
      // Sentry error tracking
      SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN || '',
      SENTRY_ENVIRONMENT: 'production',
      // Node.js options
      NODE_OPTIONS: '--enable-source-maps',
    };

    // ========================================================================
    // MCP Server Lambda Function
    //
    // Uses NodejsFunction with esbuild for local bundling (no Docker needed)
    // ========================================================================
    this.mcpServerFunction = new NodejsFunction(this, 'MCPServerFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../../src/lambda/mcp-server/handler.ts'),
      handler: 'handler',
      functionName: 'finanseal-mcp-server',
      description: 'Groot Finance Category 3 MCP Server - domain intelligence with human approval workflow',
      memorySize: 512,
      timeout: cdk.Duration.seconds(30),
      architecture: lambda.Architecture.ARM_64, // Cost-effective for Node.js
      logGroup,
      tracing: lambda.Tracing.ACTIVE, // X-Ray tracing
      environment: lambdaEnvVars,
      bundling: {
        minify: true,
        sourceMap: true,
        target: 'node20',
        // External packages that should not be bundled
        // @aws-sdk/* uses Lambda runtime-provided SDK (smaller bundle, faster cold start)
        externalModules: ['@aws-sdk/*'],
        // esbuild options
        format: OutputFormat.CJS,
      },
    });

    // S3 write permission for PDF report generation
    const reportsBucket = s3.Bucket.fromBucketName(this, 'ReportsBucket', 'finanseal-bucket');
    reportsBucket.grantWrite(this.mcpServerFunction, 'reports/*');

    // ========================================================================
    // SES Permissions (031-chat-cross-biz-voice: send_email_report tool)
    // ========================================================================
    this.mcpServerFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ses:SendEmail', 'ses:SendRawEmail'],
        resources: ['*'],
        conditions: {
          StringEquals: {
            'ses:FromAddress': 'noreply@notifications.hellogroot.com',
          },
        },
      })
    );

    // ========================================================================
    // Lambda Version and Alias
    // ========================================================================
    const currentVersion = this.mcpServerFunction.currentVersion;
    const envHash = generateEnvHash(lambdaEnvVars);

    this.mcpServerAlias = new lambda.Alias(this, 'ProdAlias', {
      aliasName: 'prod',
      version: currentVersion,
      description: `Production alias (env: ${envHash})`,
    });

    // ========================================================================
    // API Gateway
    // ========================================================================
    const api = new apigateway.RestApi(this, 'MCPServerAPI', {
      restApiName: 'Groot Finance MCP Server',
      description: 'Category 3 MCP Server API - JSON-RPC 2.0 with API key auth and proposal workflow',
      deployOptions: {
        stageName: 'v1',
        throttlingRateLimit: 100,
        throttlingBurstLimit: 200,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: ['POST', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });

    // POST /mcp endpoint
    const mcpResource = api.root.addResource('mcp');
    mcpResource.addMethod('POST', new apigateway.LambdaIntegration(this.mcpServerAlias, {
      proxy: true,
    }));

    this.mcpApiEndpoint = `${api.url}mcp`;

    // ========================================================================
    // Vercel OIDC Invocation Permission
    // ========================================================================
    const vercelOidcRoleArn = 'arn:aws:iam::837224017779:role/FinanSEAL-Vercel-S3-Role';

    this.mcpServerAlias.addPermission('VercelOidcInvoke', {
      principal: new iam.ArnPrincipal(vercelOidcRoleArn),
      action: 'lambda:InvokeFunction',
    });

    // ========================================================================
    // CloudWatch Alarms (032-mcp-first observability)
    // ========================================================================
    const alarmEmail = 'dev@hellogroot.com';

    const mcpAlarmTopic = new sns.Topic(this, 'MCPServerAlarmTopic', {
      topicName: 'finanseal-mcp-server-alarms',
      displayName: 'Groot Finance MCP Server Alarms',
    });

    mcpAlarmTopic.addSubscription(
      new snsSubscriptions.EmailSubscription(alarmEmail)
    );

    // Lambda error alarm: 3+ errors in 5 minutes
    const mcpErrorAlarm = new cloudwatch.Alarm(this, 'MCPServerErrorAlarm', {
      metric: this.mcpServerFunction.metricErrors({
        period: cdk.Duration.minutes(5),
        statistic: 'Sum',
      }),
      threshold: 3,
      evaluationPeriods: 1,
      alarmDescription: 'MCP Server Lambda: 3+ errors in 5 minutes',
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    mcpErrorAlarm.addAlarmAction(new actions.SnsAction(mcpAlarmTopic));

    // P99 latency alarm: >10s (Lambda timeout is 30s)
    const mcpLatencyAlarm = new cloudwatch.Alarm(this, 'MCPServerLatencyAlarm', {
      metric: this.mcpServerFunction.metricDuration({
        period: cdk.Duration.minutes(5),
        statistic: 'p99',
      }),
      threshold: 10_000, // 10 seconds in milliseconds
      evaluationPeriods: 2,
      alarmDescription: 'MCP Server Lambda: P99 latency >10s for 10 minutes',
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    mcpLatencyAlarm.addAlarmAction(new actions.SnsAction(mcpAlarmTopic));

    // API Gateway 5XX alarm: 5+ server errors in 5 minutes
    const api5xxAlarm = new cloudwatch.Alarm(this, 'MCPServerAPI5xxAlarm', {
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ApiGateway',
        metricName: '5XXError',
        dimensionsMap: { ApiName: 'Groot Finance MCP Server' },
        period: cdk.Duration.minutes(5),
        statistic: 'Sum',
      }),
      threshold: 5,
      evaluationPeriods: 1,
      alarmDescription: 'MCP Server API Gateway: 5+ 5XX errors in 5 minutes',
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    api5xxAlarm.addAlarmAction(new actions.SnsAction(mcpAlarmTopic));

    // ========================================================================
    // Outputs
    // ========================================================================
    new cdk.CfnOutput(this, 'MCPAlarmTopicArn', {
      value: mcpAlarmTopic.topicArn,
      description: 'SNS Topic ARN for MCP Server CloudWatch Alarms',
      exportName: `${id}-MCPAlarmTopicArn`,
    });

    new cdk.CfnOutput(this, 'MCPServerEndpoint', {
      value: this.mcpApiEndpoint,
      description: 'MCP Server API endpoint URL',
      exportName: `${id}-MCPServerEndpoint`,
    });

    new cdk.CfnOutput(this, 'FunctionArn', {
      value: this.mcpServerFunction.functionArn,
      description: 'MCP Server Lambda function ARN',
      exportName: `${id}-FunctionArn`,
    });

    new cdk.CfnOutput(this, 'AliasArn', {
      value: this.mcpServerAlias.functionArn,
      description: 'MCP Server Lambda alias ARN',
      exportName: `${id}-AliasArn`,
    });

    new cdk.CfnOutput(this, 'LogGroupName', {
      value: logGroup.logGroupName,
      description: 'CloudWatch Log Group name',
      exportName: `${id}-LogGroupName`,
    });
  }
}
