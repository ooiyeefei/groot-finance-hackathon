import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ses from 'aws-cdk-lib/aws-ses';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as iam from 'aws-cdk-lib/aws-iam';
import { SesDomainConstruct } from './constructs/ses-domain';
import { DurableWorkflowConstruct } from './constructs/durable-workflow';

export interface SystemEmailStackProps extends cdk.StackProps {
  // Environment-specific configuration
}

export class SystemEmailStack extends cdk.Stack {
  public readonly emailConfigurationSet: ses.ConfigurationSet;
  public readonly emailEventsTopic: sns.Topic;
  public readonly welcomeWorkflowFunction: lambda.Function;
  public readonly welcomeWorkflowAlias: lambda.Alias;

  constructor(scope: Construct, id: string, props?: SystemEmailStackProps) {
    super(scope, id, props);

    // ─────────────────────────────────────────────
    // SES Domain Verification
    // ─────────────────────────────────────────────
    const sesDomain = new SesDomainConstruct(this, 'SesDomain', {
      domainName: 'notifications.hellogroot.com',
    });

    // ─────────────────────────────────────────────
    // SNS Topic for Email Delivery Events
    // ─────────────────────────────────────────────
    this.emailEventsTopic = new sns.Topic(this, 'EmailEventsTopic', {
      displayName: 'FinanSEAL SES Email Delivery Events',
      topicName: 'finanseal-email-delivery-events',
    });

    // ─────────────────────────────────────────────
    // SES Configuration Set with SNS Destinations
    // ─────────────────────────────────────────────
    this.emailConfigurationSet = new ses.ConfigurationSet(this, 'EmailConfigSet', {
      configurationSetName: 'finanseal-transactional',
      reputationMetrics: true,
      sendingEnabled: true,
    });

    // Add SNS destination for delivery events
    this.emailConfigurationSet.addEventDestination('ToSns', {
      destination: ses.EventDestination.snsTopic(this.emailEventsTopic),
      events: [
        ses.EmailSendingEvent.SEND,
        ses.EmailSendingEvent.DELIVERY,
        ses.EmailSendingEvent.BOUNCE,
        ses.EmailSendingEvent.COMPLAINT,
        ses.EmailSendingEvent.REJECT,
        ses.EmailSendingEvent.OPEN,
        ses.EmailSendingEvent.CLICK,
      ],
    });

    // ─────────────────────────────────────────────
    // Lambda Durable Workflow for Welcome Emails
    // ─────────────────────────────────────────────
    const durableWorkflow = new DurableWorkflowConstruct(this, 'WelcomeWorkflow', {
      configurationSetName: this.emailConfigurationSet.configurationSetName,
      emailIdentity: sesDomain.emailIdentity,
    });
    this.welcomeWorkflowFunction = durableWorkflow.function;
    this.welcomeWorkflowAlias = durableWorkflow.alias;

    // ─────────────────────────────────────────────
    // Outputs
    // ─────────────────────────────────────────────
    new cdk.CfnOutput(this, 'WelcomeWorkflowAliasArn', {
      value: this.welcomeWorkflowAlias.functionArn,
      description: 'ARN of the Welcome Workflow Lambda Alias (use this for invocation)',
      exportName: 'FinansealWelcomeWorkflowAliasArn',
    });

    new cdk.CfnOutput(this, 'WelcomeWorkflowArn', {
      value: this.welcomeWorkflowFunction.functionArn,
      description: 'ARN of the Welcome Workflow Lambda function',
      exportName: 'FinansealWelcomeWorkflowArn',
    });

    new cdk.CfnOutput(this, 'ConfigurationSetName', {
      value: this.emailConfigurationSet.configurationSetName,
      description: 'SES Configuration Set name for email tracking',
      exportName: 'FinansealEmailConfigSetName',
    });

    new cdk.CfnOutput(this, 'EmailEventsTopicArn', {
      value: this.emailEventsTopic.topicArn,
      description: 'SNS Topic ARN for email delivery events',
      exportName: 'FinansealEmailEventsTopicArn',
    });

    // ─────────────────────────────────────────────
    // CloudWatch Alarms for Monitoring
    // ─────────────────────────────────────────────

    // SNS Topic for alarm notifications
    const alarmTopic = new sns.Topic(this, 'AlarmNotificationTopic', {
      displayName: 'FinanSEAL Email System Alarms',
      topicName: 'finanseal-email-alarms',
    });

    // Lambda Error Alarm - Welcome Workflow
    const welcomeWorkflowErrorAlarm = new cloudwatch.Alarm(this, 'WelcomeWorkflowErrorAlarm', {
      alarmName: 'FinanSEAL-WelcomeWorkflow-Errors',
      alarmDescription: 'Alert when Welcome Workflow Lambda has errors',
      metric: this.welcomeWorkflowFunction.metricErrors({
        period: cdk.Duration.minutes(5),
        statistic: 'Sum',
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    welcomeWorkflowErrorAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alarmTopic));

    // SES Bounce Rate Alarm (alert at 3% - SES suspends at 5%)
    const sesBounceRateAlarm = new cloudwatch.Alarm(this, 'SESBounceRateAlarm', {
      alarmName: 'FinanSEAL-SES-BounceRate',
      alarmDescription: 'Alert when SES bounce rate exceeds 3% (SES suspends at 5%)',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/SES',
        metricName: 'Reputation.BounceRate',
        statistic: 'Average',
        period: cdk.Duration.hours(1),
      }),
      threshold: 0.03, // 3%
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    sesBounceRateAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alarmTopic));

    // SES Complaint Rate Alarm (alert at 0.05% - SES suspends at 0.1%)
    const sesComplaintRateAlarm = new cloudwatch.Alarm(this, 'SESComplaintRateAlarm', {
      alarmName: 'FinanSEAL-SES-ComplaintRate',
      alarmDescription: 'Alert when SES complaint rate exceeds 0.05% (SES suspends at 0.1%)',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/SES',
        metricName: 'Reputation.ComplaintRate',
        statistic: 'Average',
        period: cdk.Duration.hours(1),
      }),
      threshold: 0.0005, // 0.05%
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    sesComplaintRateAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alarmTopic));

    // Lambda Duration Alarm - Alert if workflow takes too long
    const welcomeWorkflowDurationAlarm = new cloudwatch.Alarm(this, 'WelcomeWorkflowDurationAlarm', {
      alarmName: 'FinanSEAL-WelcomeWorkflow-Duration',
      alarmDescription: 'Alert when Welcome Workflow takes longer than 4 minutes (timeout is 5 min)',
      metric: this.welcomeWorkflowFunction.metricDuration({
        period: cdk.Duration.minutes(5),
        statistic: 'Average',
      }),
      threshold: 240000, // 4 minutes in milliseconds
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    welcomeWorkflowDurationAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alarmTopic));

    // Output alarm topic ARN for email subscription
    new cdk.CfnOutput(this, 'AlarmTopicArn', {
      value: alarmTopic.topicArn,
      description: 'SNS Topic ARN for alarm notifications (subscribe your email)',
      exportName: 'FinansealEmailAlarmsTopicArn',
    });
  }
}
