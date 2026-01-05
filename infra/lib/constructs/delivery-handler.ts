import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as path from 'path';

export interface DeliveryHandlerConstructProps {
  emailEventsTopic: sns.Topic;
}

/**
 * Delivery Handler Lambda Construct
 *
 * Processes SES delivery events from SNS:
 * - SEND: Email accepted by SES
 * - DELIVERY: Email delivered to recipient
 * - BOUNCE: Hard or soft bounce
 * - COMPLAINT: Spam complaint
 * - REJECT: SES rejected (suppression list)
 * - OPEN: Recipient opened email
 * - CLICK: Recipient clicked link
 *
 * Updates Convex database with delivery status and
 * manages email suppressions for bounces/complaints.
 */
export class DeliveryHandlerConstruct extends Construct {
  public readonly function: lambda.Function;

  constructor(scope: Construct, id: string, props: DeliveryHandlerConstructProps) {
    super(scope, id);

    // Lambda execution role
    const executionRole = new iam.Role(this, 'ExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSLambdaBasicExecutionRole'
        ),
      ],
    });

    // Create Lambda function
    this.function = new lambda.Function(this, 'Function', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../../lambda/delivery-handler')),
      timeout: cdk.Duration.seconds(30),
      memorySize: 128,
      role: executionRole,
      environment: {
        CONVEX_URL: 'https://kindhearted-lynx-129.convex.cloud',
        NODE_ENV: 'production',
      },
      description: 'SES delivery event handler - updates email logs and suppressions',
    });

    // Subscribe to SNS topic
    props.emailEventsTopic.addSubscription(
      new snsSubscriptions.LambdaSubscription(this.function)
    );

    // Output function ARN
    new cdk.CfnOutput(this, 'FunctionArn', {
      value: this.function.functionArn,
      description: 'Delivery Handler Lambda ARN',
    });
  }
}
