import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
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
        externalModules: [],
        // esbuild options
        format: OutputFormat.CJS,
      },
    });

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
    // Outputs
    // ========================================================================
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
