import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

interface ScheduledJob {
  module: string;
  schedule: string; // EventBridge cron expression
  description: string;
  isWeeklyDspy?: boolean; // Flag for weekly DSPy jobs (different alarm threshold)
}

export interface ScheduledIntelligenceStackProps extends cdk.StackProps {
  alarmEmail?: string; // Email for alarm notifications (defaults to dev@hellogroot.com)
}

export class ScheduledIntelligenceStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: ScheduledIntelligenceStackProps) {
    super(scope, id, props);

    const alarmEmail = props?.alarmEmail || 'dev@hellogroot.com';

    // Convex deployment key — passed at deploy time, stored as SSM SecureString
    // Usage: npx cdk deploy --parameters ConvexDeployKey=$CONVEX_DEPLOY_KEY
    const convexDeployKeyParam = new cdk.CfnParameter(this, 'ConvexDeployKey', {
      type: 'String',
      noEcho: true, // Masks value in CloudFormation console
      description: 'Convex deployment key for HTTP API authentication',
    });

    new ssm.StringParameter(this, 'ConvexDeployKeySSM', {
      parameterName: '/finanseal/convex-deployment-key',
      description: 'Convex deployment key for Lambda → Convex HTTP API auth',
      stringValue: convexDeployKeyParam.valueAsString,
      tier: ssm.ParameterTier.STANDARD,
    });

    // DLQ for failed EventBridge events
    const dlq = new sqs.Queue(this, 'ScheduledIntelligenceDLQ', {
      queueName: 'finanseal-scheduled-intelligence-dlq',
      retentionPeriod: cdk.Duration.days(14),
    });

    // SNS topic for CloudWatch alarms
    const alarmTopic = new sns.Topic(this, 'ScheduledIntelligenceAlarmTopic', {
      topicName: 'finanseal-scheduled-intelligence-alarms',
      displayName: 'Groot Finance Scheduled Intelligence Alarms',
    });

    // Email subscription for alarm notifications
    alarmTopic.addSubscription(
      new snsSubscriptions.EmailSubscription(alarmEmail)
    );

    // Lambda function
    const scheduledIntelligenceLambda = new lambda.Function(
      this,
      'ScheduledIntelligenceFunction',
      {
        functionName: 'finanseal-scheduled-intelligence',
        runtime: lambda.Runtime.NODEJS_20_X,
        architecture: lambda.Architecture.ARM_64,
        handler: 'index.handler',
        code: lambda.Code.fromAsset('../src/lambda/scheduled-intelligence', {
          bundling: {
            image: lambda.Runtime.NODEJS_20_X.bundlingImage,
            command: [
              'bash',
              '-c',
              [
                'npm install',
                'npm run build',
                'cp -r node_modules dist/node_modules',
                'cp -r dist/* /asset-output/',
              ].join(' && '),
            ],
            user: 'root',
          },
        }),
        memorySize: 512,
        timeout: cdk.Duration.seconds(300), // 5 minutes (analysis jobs can be slow)
        // Note: reservedConcurrentExecutions removed — account doesn't have enough
        // unreserved concurrency. EventBridge retryAttempts:2 handles overlap protection.
        environment: {
          NODE_ENV: 'production',
          // Convex deployment URL (kindhearted-lynx-129)
          CONVEX_DEPLOYMENT_URL:
            'https://kindhearted-lynx-129.convex.cloud',
          // SSM parameter path for Convex deployment key
          CONVEX_DEPLOYMENT_KEY_PARAM:
            '/finanseal/convex-deployment-key',
          // DSPy optimizer Lambda ARN (from document-processing-stack.ts)
          DSPY_OPTIMIZER_LAMBDA_ARN: cdk.Fn.sub(
            'arn:aws:lambda:${AWS::Region}:${AWS::AccountId}:function:finanseal-dspy-optimizer'
          ),
        },
      }
    );

    // Grant permission to read Convex deployment key from SSM
    scheduledIntelligenceLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ssm:GetParameter'],
        resources: [
          cdk.Fn.sub(
            'arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter/finanseal/convex-deployment-key'
          ),
        ],
      })
    );

    // Grant permission to invoke the DSPy optimizer Lambda
    scheduledIntelligenceLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['lambda:InvokeFunction'],
        resources: [
          cdk.Fn.sub(
            'arn:aws:lambda:${AWS::Region}:${AWS::AccountId}:function:finanseal-dspy-optimizer'
          ),
          cdk.Fn.sub(
            'arn:aws:lambda:${AWS::Region}:${AWS::AccountId}:function:finanseal-dspy-optimizer:*'
          ),
        ],
      })
    );

    // Define all scheduled jobs
    const scheduledJobs: ScheduledJob[] = [
      // Daily jobs (4am UTC = 12pm MYT)
      {
        module: 'proactive-analysis',
        schedule: 'cron(0 4 * * ? *)',
        description: 'Daily proactive business insights analysis',
      },
      {
        module: 'ai-discovery',
        schedule: 'cron(0 4 * * ? *)',
        description: 'Daily AI discovery for action center insights',
      },
      {
        module: 'notification-digest',
        schedule: 'cron(0 4 * * ? *)',
        description: 'Daily notification digest for users',
      },
      {
        module: 'einvoice-monitoring',
        schedule: 'cron(0 4 * * ? *)',
        description: 'Daily e-invoice failure monitoring and cleanup',
      },
      {
        module: 'ai-daily-digest',
        schedule: 'cron(0 4 * * ? *)',
        description: 'Daily AI digest (re-enabled from Convex)',
      },

      // Weekly jobs (Sunday 2am UTC = 10am MYT)
      {
        module: 'dspy-fee',
        schedule: 'cron(0 2 ? * SUN *)',
        description: 'Weekly DSPy fee classification optimization',
        isWeeklyDspy: true,
      },
      {
        module: 'dspy-bank-recon',
        schedule: 'cron(0 2 ? * SUN *)',
        description: 'Weekly DSPy bank reconciliation optimization',
        isWeeklyDspy: true,
      },
      {
        module: 'dspy-po-match',
        schedule: 'cron(0 2 ? * SUN *)',
        description: 'Weekly DSPy PO-Invoice matching optimization',
        isWeeklyDspy: true,
      },
      {
        module: 'dspy-ar-match',
        schedule: 'cron(0 2 ? * SUN *)',
        description: 'Weekly DSPy AR order matching optimization',
        isWeeklyDspy: true,
      },
      {
        module: 'chat-agent-optimization',
        schedule: 'cron(0 2 ? * SUN *)',
        description: 'Weekly chat agent RAG optimization',
        isWeeklyDspy: true,
      },
      {
        module: 'einvoice-dspy-digest',
        schedule: 'cron(0 2 ? * SUN *)',
        description: 'Weekly e-invoice pattern digest (re-enabled)',
      },
      {
        module: 'weekly-email-digest',
        schedule: 'cron(0 2 ? * SUN *)',
        description: 'Weekly email digest to business owners',
      },

      // Scheduled reports — daily at 4am UTC (12pm MYT)
      // Handler checks each schedule's frequency and only processes due ones
      {
        module: 'scheduled-reports',
        schedule: 'cron(0 4 * * ? *)',
        description: 'Daily check for scheduled reports (daily/weekly/monthly)',
      },
    ];

    // Create EventBridge rules for each job
    scheduledJobs.forEach((job) => {
      const rule = new events.Rule(this, `${job.module}Rule`, {
        ruleName: `finanseal-${job.module}`,
        description: job.description,
        schedule: events.Schedule.expression(job.schedule),
      });

      rule.addTarget(
        new targets.LambdaFunction(scheduledIntelligenceLambda, {
          deadLetterQueue: dlq,
          maxEventAge: cdk.Duration.hours(2),
          retryAttempts: 2,
          event: events.RuleTargetInput.fromObject({
            source: 'aws.events',
            'detail-type': 'Scheduled Event',
            detail: {
              module: job.module,
            },
          }),
        })
      );
    });

    // CloudWatch alarm for Lambda errors
    const errorMetric = scheduledIntelligenceLambda.metricErrors({
      period: cdk.Duration.hours(1),
      statistic: 'Sum',
    });

    const errorAlarm = new cloudwatch.Alarm(
      this,
      'ScheduledIntelligenceErrorAlarm',
      {
        metric: errorMetric,
        threshold: 3, // Alert if 3+ errors in 1 hour
        evaluationPeriods: 1,
        alarmDescription:
          'Alert when scheduled intelligence jobs fail 3+ times in 1 hour',
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }
    );

    errorAlarm.addAlarmAction(new actions.SnsAction(alarmTopic));

    // CloudWatch alarm for weekly DSPy jobs (2+ consecutive failures)
    // Weekly DSPy jobs: dspy-fee, dspy-bank-recon, dspy-po-match, dspy-ar-match, chat-agent-optimization
    const weeklyDspyJobs = scheduledJobs.filter((job) => job.isWeeklyDspy);
    const weeklyDspyErrorMetric = scheduledIntelligenceLambda.metricErrors({
      period: cdk.Duration.days(7), // 1 week window
      statistic: 'Sum',
    });

    const weeklyDspyAlarm = new cloudwatch.Alarm(
      this,
      'WeeklyDspyJobsErrorAlarm',
      {
        metric: weeklyDspyErrorMetric,
        threshold: 2, // Alert if 2+ errors in 1 week (indicates consecutive failures)
        evaluationPeriods: 1,
        alarmDescription:
          'Alert when weekly DSPy jobs fail 2+ times in 1 week (consecutive failures)',
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }
    );

    weeklyDspyAlarm.addAlarmAction(new actions.SnsAction(alarmTopic));

    // CloudWatch alarm for DLQ depth (metric alarm on DLQ message count)
    const dlqDepthMetric = dlq.metricApproximateNumberOfMessagesVisible({
      period: cdk.Duration.minutes(5),
      statistic: 'Maximum',
    });

    const dlqAlarm = new cloudwatch.Alarm(
      this,
      'ScheduledIntelligenceDLQAlarm',
      {
        metric: dlqDepthMetric,
        threshold: 5, // Alert if 5+ messages in DLQ
        evaluationPeriods: 1,
        alarmDescription:
          'Alert when scheduled intelligence jobs fail and land in DLQ',
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }
    );

    dlqAlarm.addAlarmAction(new actions.SnsAction(alarmTopic));

    // Outputs
    new cdk.CfnOutput(this, 'LambdaFunctionName', {
      value: scheduledIntelligenceLambda.functionName,
      description: 'Scheduled Intelligence Lambda Function Name',
    });

    new cdk.CfnOutput(this, 'LambdaFunctionArn', {
      value: scheduledIntelligenceLambda.functionArn,
      description: 'Scheduled Intelligence Lambda Function ARN',
    });

    new cdk.CfnOutput(this, 'DLQUrl', {
      value: dlq.queueUrl,
      description: 'Dead Letter Queue URL',
    });

    new cdk.CfnOutput(this, 'AlarmTopicArn', {
      value: alarmTopic.topicArn,
      description: 'SNS Topic ARN for CloudWatch Alarms',
    });
  }
}
