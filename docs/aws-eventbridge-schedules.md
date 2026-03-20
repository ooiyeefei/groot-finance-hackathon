# AWS EventBridge Schedule Patterns & CDK Integration

## Overview

AWS EventBridge provides scheduled rules for triggering Lambda functions and other AWS services. This document covers schedule expression syntax, CDK integration patterns, error handling, and monitoring.

---

## 1. EventBridge Cron Expression Syntax

### Cron Format

EventBridge uses a **6-field cron expression** (not standard 5-field Unix cron):

```
cron(minute hour day-of-month month day-of-week year)
```

| Field | Values | Wildcards |
|-------|--------|-----------|
| **minute** | 0-59 | `, - * /` |
| **hour** | 0-23 (UTC) | `, - * /` |
| **day-of-month** | 1-31 | `, - * ? / L W` |
| **month** | 1-12 or JAN-DEC | `, - * /` |
| **day-of-week** | 1-7 or SUN-SAT (1 = Sunday) | `, - * ? L #` |
| **year** | 1970-2199 | `, - * /` |

**Important differences from Unix cron:**
- **6 fields** (includes year field)
- **Day-of-month OR day-of-week must use `?`** (not both `*`)
- **All times in UTC** (not local timezone)
- **No special strings** like `@daily`, `@hourly`

### Wildcards Explained

| Symbol | Meaning | Example |
|--------|---------|---------|
| `*` | All values | `* * * * ? *` = every minute |
| `?` | Any value (for day fields) | Use when you don't care about day-of-month or day-of-week |
| `-` | Range | `10-12` = 10, 11, 12 |
| `,` | List | `MON,WED,FRI` = Monday, Wednesday, Friday |
| `/` | Increments | `0/15` = every 15 minutes starting at minute 0 (0, 15, 30, 45) |
| `L` | Last (day-of-month or day-of-week) | `L` = last day of month, `5L` = last Friday |
| `W` | Nearest weekday | `15W` = nearest weekday to 15th |
| `#` | Nth occurrence | `3#2` = second Wednesday of month |

### Common Schedule Examples

```bash
# Every minute
cron(* * * * ? *)

# Every 5 minutes
cron(0/5 * * * ? *)

# Every hour at minute 0
cron(0 * * * ? *)

# Every day at 2:00 AM UTC
cron(0 2 * * ? *)

# Every weekday (Mon-Fri) at 9:00 AM UTC
cron(0 9 ? * MON-FRI *)

# Every Monday at 10:30 AM UTC
cron(30 10 ? * MON *)

# First day of every month at midnight UTC
cron(0 0 1 * ? *)

# Last day of every month at 11:59 PM UTC
cron(59 23 L * ? *)

# Second Tuesday of every month at 8:00 AM UTC
cron(0 8 ? * TUE#2 *)

# Every 15 minutes between 8 AM and 5 PM on weekdays
cron(0/15 8-17 ? * MON-FRI *)

# Weekly on Sunday at 3:00 AM UTC
cron(0 3 ? * SUN *)
```

---

## 2. CDK Schedule Patterns

### Schedule.rate() — Simple Intervals

Use `Schedule.rate()` for simple recurring intervals:

```typescript
import * as events from 'aws-cdk-lib/aws-events';
import * as cdk from 'aws-cdk-lib';

// Every 5 minutes
events.Schedule.rate(cdk.Duration.minutes(5))

// Every 3 days
events.Schedule.rate(cdk.Duration.days(3))

// Every hour
events.Schedule.rate(cdk.Duration.hours(1))

// Every 30 seconds (minimum is 1 minute for production)
events.Schedule.rate(cdk.Duration.seconds(30)) // Only works for testing
```

**Limitations:**
- **Minimum interval: 1 minute** (sub-minute rates may work but are not officially supported)
- Cannot specify **specific times** (e.g., "every day at 2 AM")
- Rates must convert to **whole minutes** (e.g., `Duration.seconds(90)` works, but `Duration.seconds(65)` does not)

**When to use:**
- Simple recurring intervals (every N minutes/hours/days)
- No need for specific time-of-day control
- Easier to read than cron expressions

### Schedule.cron() — Precise Time Control

Use `Schedule.cron()` when you need specific times or days:

```typescript
import * as events from 'aws-cdk-lib/aws-events';

// Every day at 2:00 AM UTC
events.Schedule.cron({
  minute: '0',
  hour: '2',
})

// Every Monday at 9:00 AM UTC
events.Schedule.cron({
  minute: '0',
  hour: '9',
  weekDay: 'MON',
})

// Every 15 minutes (starting at minute 0)
events.Schedule.cron({
  minute: '0/15',
})

// First day of every month at midnight
events.Schedule.cron({
  minute: '0',
  hour: '0',
  day: '1',
})

// Weekdays at 10:30 AM UTC
events.Schedule.cron({
  minute: '30',
  hour: '10',
  weekDay: 'MON-FRI',
})
```

**When to use:**
- Specific time of day (e.g., "daily at 2 AM")
- Specific days (e.g., "every Monday")
- Complex schedules (e.g., "first Tuesday of each month")

### Schedule.expression() — Raw Cron String

Use `Schedule.expression()` for advanced cron expressions not supported by the type-safe API:

```typescript
// Raw cron expression
events.Schedule.expression('cron(0 2 L * ? *)') // Last day of month at 2 AM

// Raw rate expression
events.Schedule.expression('rate(5 minutes)')
```

**When to use:**
- Complex cron expressions (e.g., `L`, `W`, `#` wildcards)
- When CDK's type-safe API doesn't support your pattern

---

## 3. CDK EventBridge Rule Configuration

### Basic Rule with Lambda Target

```typescript
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as lambda from 'aws-cdk-lib/aws-lambda';

const myFunction = new lambda.Function(this, 'MyFunction', {
  runtime: lambda.Runtime.NODEJS_20_X,
  handler: 'index.handler',
  code: lambda.Code.fromAsset('lambda'),
});

const rule = new events.Rule(this, 'ScheduleRule', {
  ruleName: 'my-scheduled-task',
  description: 'Runs my Lambda function every 5 minutes',
  schedule: events.Schedule.rate(cdk.Duration.minutes(5)),
});

rule.addTarget(new targets.LambdaFunction(myFunction));
```

### Passing Custom Event Payload

```typescript
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';

const rule = new events.Rule(this, 'DailyReport', {
  schedule: events.Schedule.cron({ hour: '2', minute: '0' }),
});

rule.addTarget(new targets.LambdaFunction(myFunction, {
  event: events.RuleTargetInput.fromObject({
    taskType: 'daily-report',
    runDate: events.EventField.fromPath('$.time'), // EventBridge event time
    source: 'scheduled-rule',
  }),
}));
```

The Lambda will receive:

```json
{
  "taskType": "daily-report",
  "runDate": "2026-03-20T02:00:00Z",
  "source": "scheduled-rule"
}
```

---

## 4. Daily Schedule Patterns (Specific Hour + Minute)

```typescript
// Daily at 2:00 AM UTC
const dailyRule = new events.Rule(this, 'DailyJob', {
  schedule: events.Schedule.cron({
    minute: '0',
    hour: '2',
  }),
});

// Daily at 6:30 PM UTC
const eveningRule = new events.Rule(this, 'EveningJob', {
  schedule: events.Schedule.cron({
    minute: '30',
    hour: '18',
  }),
});

// Every 6 hours at minute 0 (00:00, 06:00, 12:00, 18:00)
const sixHourlyRule = new events.Rule(this, 'SixHourly', {
  schedule: events.Schedule.cron({
    minute: '0',
    hour: '0/6',
  }),
});
```

---

## 5. Weekly Schedule Patterns (Day of Week + Hour + Minute)

```typescript
// Every Monday at 9:00 AM UTC
const mondayRule = new events.Rule(this, 'MondayMorning', {
  schedule: events.Schedule.cron({
    minute: '0',
    hour: '9',
    weekDay: 'MON',
  }),
});

// Every Friday at 5:00 PM UTC
const fridayRule = new events.Rule(this, 'FridayAfternoon', {
  schedule: events.Schedule.cron({
    minute: '0',
    hour: '17',
    weekDay: 'FRI',
  }),
});

// Weekdays (Mon-Fri) at 10:30 AM UTC
const weekdayRule = new events.Rule(this, 'WeekdayMorning', {
  schedule: events.Schedule.cron({
    minute: '30',
    hour: '10',
    weekDay: 'MON-FRI',
  }),
});

// Weekend (Sat-Sun) at midnight UTC
const weekendRule = new events.Rule(this, 'WeekendMidnight', {
  schedule: events.Schedule.cron({
    minute: '0',
    hour: '0',
    weekDay: 'SAT-SUN',
  }),
});

// Every Tuesday and Thursday at 3:00 PM UTC
const tueThuRule = new events.Rule(this, 'TuesdayThursday', {
  schedule: events.Schedule.cron({
    minute: '0',
    hour: '15',
    weekDay: 'TUE,THU',
  }),
});
```

---

## 6. Dead-Letter Queue Configuration

EventBridge can send failed invocations to an SQS dead-letter queue for later analysis:

```typescript
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';

// Create DLQ
const dlq = new sqs.Queue(this, 'FailedInvocationsDLQ', {
  queueName: 'eventbridge-failed-invocations',
  retentionPeriod: cdk.Duration.days(14), // Keep failed events for 14 days
});

// Add DLQ to Lambda target
const rule = new events.Rule(this, 'ScheduledTask', {
  schedule: events.Schedule.rate(cdk.Duration.minutes(5)),
});

rule.addTarget(new targets.LambdaFunction(myFunction, {
  deadLetterQueue: dlq,
  retryAttempts: 2, // Retry up to 2 times before sending to DLQ
  maxEventAge: cdk.Duration.hours(2), // Discard events older than 2 hours
}));
```

**DLQ message format:**

```json
{
  "version": "0",
  "id": "12345678-1234-1234-1234-123456789012",
  "detail-type": "Scheduled Event",
  "source": "aws.events",
  "time": "2026-03-20T02:00:00Z",
  "region": "us-west-2",
  "resources": ["arn:aws:events:us-west-2:123456789012:rule/my-rule"],
  "detail": {},
  "errorCode": "InvocationError",
  "errorMessage": "Lambda function failed with status 500"
}
```

**When to use DLQ:**
- Critical scheduled jobs (DSPy optimization, reporting, billing)
- Need to replay failed events later
- Debugging schedule-triggered failures

---

## 7. Retry Behavior and Backoff Strategies

EventBridge automatically retries failed Lambda invocations with exponential backoff:

```typescript
rule.addTarget(new targets.LambdaFunction(myFunction, {
  retryAttempts: 2,        // Max 2 retries (default: 185)
  maxEventAge: cdk.Duration.hours(1), // Discard after 1 hour (default: 24 hours)
}));
```

### Default Retry Behavior

| Attempt | Delay | Total Elapsed Time |
|---------|-------|-------------------|
| 1st retry | ~1 second | ~1 second |
| 2nd retry | ~2 seconds | ~3 seconds |
| 3rd retry | ~4 seconds | ~7 seconds |
| 4th retry | ~8 seconds | ~15 seconds |
| ... | Exponential | ... |
| 185th retry (max) | ~5 minutes | ~24 hours (default maxEventAge) |

**Retry policy applies to:**
- Lambda throttling errors (429 TooManyRequestsException)
- Lambda function errors (unhandled exceptions)
- Lambda timeouts

**Retry policy does NOT apply to:**
- Lambda cold start delays (these are not errors)
- Successful invocations with business logic errors (Lambda returns 200 OK)

### Custom Retry Strategy

```typescript
// Aggressive retry for time-sensitive jobs
rule.addTarget(new targets.LambdaFunction(myFunction, {
  retryAttempts: 5,               // Retry up to 5 times
  maxEventAge: cdk.Duration.minutes(15), // Give up after 15 minutes
  deadLetterQueue: dlq,           // Send failures to DLQ
}));

// Minimal retry for idempotent batch jobs
rule.addTarget(new targets.LambdaFunction(myFunction, {
  retryAttempts: 1,               // Only retry once
  maxEventAge: cdk.Duration.minutes(5), // Give up quickly
}));
```

---

## 8. CloudWatch Alarm Integration for Missed Schedules

Monitor EventBridge rules with CloudWatch alarms:

```typescript
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as actions from 'aws-cdk-lib/aws-cloudwatch-actions';

// Create SNS topic for alerts
const alertTopic = new sns.Topic(this, 'ScheduleAlerts', {
  displayName: 'EventBridge Schedule Alerts',
});

// Alarm for failed invocations
const failedInvocationsAlarm = new cloudwatch.Alarm(this, 'FailedInvocations', {
  metric: rule.metricFailedInvocations({
    period: cdk.Duration.minutes(5),
    statistic: 'Sum',
  }),
  threshold: 1,
  evaluationPeriods: 1,
  alarmName: 'eventbridge-failed-invocations',
  alarmDescription: 'Alert when EventBridge rule fails to invoke target',
  treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
});

failedInvocationsAlarm.addAlarmAction(new actions.SnsAction(alertTopic));

// Alarm for no invocations (missed schedule)
const noInvocationsAlarm = new cloudwatch.Alarm(this, 'NoInvocations', {
  metric: rule.metricInvocations({
    period: cdk.Duration.hours(1),
    statistic: 'Sum',
  }),
  threshold: 1,
  comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
  evaluationPeriods: 1,
  alarmName: 'eventbridge-no-invocations',
  alarmDescription: 'Alert when EventBridge rule has not triggered in the past hour',
  treatMissingData: cloudwatch.TreatMissingData.BREACHING,
});

noInvocationsAlarm.addAlarmAction(new actions.SnsAction(alertTopic));

// Alarm for throttled invocations
const throttledAlarm = new cloudwatch.Alarm(this, 'ThrottledInvocations', {
  metric: rule.metricThrottledRules({
    period: cdk.Duration.minutes(5),
    statistic: 'Sum',
  }),
  threshold: 1,
  evaluationPeriods: 1,
  alarmName: 'eventbridge-throttled',
  alarmDescription: 'Alert when EventBridge rule is throttled',
});

throttledAlarm.addAlarmAction(new actions.SnsAction(alertTopic));
```

### Key Metrics to Monitor

| Metric | Description | Alarm Threshold |
|--------|-------------|-----------------|
| `Invocations` | Number of times rule triggered | < 1 (for critical schedules) |
| `FailedInvocations` | Number of failed target invocations | > 0 |
| `ThrottledRules` | Number of throttled invocations | > 0 |
| `TriggeredRules` | Number of times rule matched events | < 1 (for critical schedules) |

---

## 9. Complete Example: Weekly DSPy Optimization Job

```typescript
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as actions from 'aws-cdk-lib/aws-cloudwatch-actions';

export class DspyOptimizationStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Lambda function for DSPy optimization
    const optimizerFunction = new lambda.DockerImageFunction(this, 'DspyOptimizer', {
      code: lambda.DockerImageCode.fromImageAsset('src/lambda/dspy-optimizer'),
      functionName: 'finanseal-dspy-optimizer',
      description: 'Weekly DSPy model optimization with MIPROv2',
      memorySize: 2048,
      timeout: cdk.Duration.minutes(15),
      environment: {
        NEXT_PUBLIC_CONVEX_URL: 'https://kindhearted-lynx-129.convex.cloud',
        S3_BUCKET_NAME: 'finanseal-bucket',
      },
    });

    // Dead-letter queue for failed optimizations
    const dlq = new sqs.Queue(this, 'OptimizerDLQ', {
      queueName: 'dspy-optimizer-failed-runs',
      retentionPeriod: cdk.Duration.days(14),
    });

    // EventBridge rule: Every Sunday at 3:00 AM UTC
    const weeklyRule = new events.Rule(this, 'WeeklyOptimization', {
      ruleName: 'finanseal-dspy-weekly-optimization',
      description: 'Trigger DSPy optimization every Sunday at 3:00 AM UTC',
      schedule: events.Schedule.cron({
        minute: '0',
        hour: '3',
        weekDay: 'SUN',
      }),
    });

    // Add Lambda target with retry policy and DLQ
    weeklyRule.addTarget(new targets.LambdaFunction(optimizerFunction, {
      event: events.RuleTargetInput.fromObject({
        taskType: 'weekly-optimization',
        triggerTime: events.EventField.fromPath('$.time'),
      }),
      deadLetterQueue: dlq,
      retryAttempts: 2,
      maxEventAge: cdk.Duration.hours(4), // 4-hour window for completion
    }));

    // SNS topic for alerts
    const alertTopic = new sns.Topic(this, 'OptimizerAlerts', {
      displayName: 'DSPy Optimizer Alerts',
    });

    // Alarm for failed invocations
    const failureAlarm = new cloudwatch.Alarm(this, 'OptimizerFailures', {
      metric: weeklyRule.metricFailedInvocations({
        period: cdk.Duration.hours(1),
        statistic: 'Sum',
      }),
      threshold: 1,
      evaluationPeriods: 1,
      alarmName: 'dspy-optimizer-failures',
      alarmDescription: 'DSPy optimizer failed to run',
    });
    failureAlarm.addAlarmAction(new actions.SnsAction(alertTopic));

    // Alarm for missed schedule (no invocations in the past week)
    const missedScheduleAlarm = new cloudwatch.Alarm(this, 'MissedSchedule', {
      metric: weeklyRule.metricInvocations({
        period: cdk.Duration.days(7),
        statistic: 'Sum',
      }),
      threshold: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      evaluationPeriods: 1,
      alarmName: 'dspy-optimizer-missed-schedule',
      alarmDescription: 'DSPy optimizer did not run in the past week',
      treatMissingData: cloudwatch.TreatMissingData.BREACHING,
    });
    missedScheduleAlarm.addAlarmAction(new actions.SnsAction(alertTopic));

    // DLQ messages alarm
    const dlqAlarm = new cloudwatch.Alarm(this, 'DLQMessages', {
      metric: dlq.metricApproximateNumberOfMessagesVisible({
        period: cdk.Duration.minutes(5),
        statistic: 'Maximum',
      }),
      threshold: 1,
      evaluationPeriods: 1,
      alarmName: 'dspy-optimizer-dlq-messages',
      alarmDescription: 'Failed DSPy optimization runs in DLQ',
    });
    dlqAlarm.addAlarmAction(new actions.SnsAction(alertTopic));
  }
}
```

---

## 10. Best Practices

### Schedule Design

1. **Use `Schedule.rate()` for simple intervals** — easier to read and maintain
2. **Use `Schedule.cron()` for specific times** — daily at 2 AM, every Monday, etc.
3. **Always specify UTC times** — EventBridge does not support local timezones
4. **Avoid sub-minute schedules** — minimum supported interval is 1 minute
5. **Spread scheduled jobs across time** — avoid triggering multiple heavy jobs at the same time

### Error Handling

1. **Always configure DLQ for critical jobs** — enables replay and debugging
2. **Set appropriate `maxEventAge`** — don't retry stale events indefinitely
3. **Set `retryAttempts` based on job characteristics:**
   - High retry for transient errors (network, throttling)
   - Low retry for idempotent batch jobs
4. **Make Lambda handlers idempotent** — retries should not cause duplicate side effects

### Monitoring

1. **Create CloudWatch alarms for:**
   - Failed invocations (`metricFailedInvocations`)
   - Missed schedules (`metricInvocations < threshold`)
   - DLQ message count (`dlq.metricApproximateNumberOfMessagesVisible`)
2. **Use SNS for alerting** — email, Slack, PagerDuty integration
3. **Monitor Lambda duration** — ensure jobs complete within timeout
4. **Set up CloudWatch Logs Insights queries** — analyze failure patterns

### Cost Optimization

1. **EventBridge is free tier:** 14 million invocations/month
2. **Lambda cost:** billed per invocation + GB-second
3. **DLQ cost:** SQS message storage (minimal)
4. **Prefer EventBridge over Convex crons for scheduled Lambda invocations** — zero Convex bandwidth cost

### Security

1. **Use least-privilege IAM policies** — Lambda execution role should only access needed resources
2. **Encrypt DLQ messages** — use SQS encryption for sensitive data
3. **Use IAM authentication for Lambda invocation** — EventBridge automatically adds invoke permissions

---

## 11. Existing Groot Finance Schedules

### LHDN Polling (Every 5 Minutes)

```typescript
// infra/lib/document-processing-stack.ts:342-348
const lhdnPollSchedule = new events.Rule(this, 'LhdnPollSchedule', {
  ruleName: 'finanseal-lhdn-poll-schedule',
  description: 'Trigger LHDN polling Lambda every 5 minutes',
  schedule: events.Schedule.rate(cdk.Duration.minutes(5)),
});
lhdnPollSchedule.addTarget(new targets.LambdaFunction(lhdnPollFunction));
```

### DSPy Optimizer (Every 3 Days)

```typescript
// infra/lib/document-processing-stack.ts:651-656
const optimizerRule = new events.Rule(this, 'DspyOptimizerSchedule', {
  ruleName: 'finanseal-dspy-optimizer-schedule',
  schedule: events.Schedule.rate(cdk.Duration.days(3)),
  description: 'Trigger DSPy optimization pipeline every 3 days',
});
optimizerRule.addTarget(new targets.LambdaFunction(optimizerFunction));
```

**Note:** Both schedules use simple `Schedule.rate()` and do not have DLQ or retry configuration. Consider adding error handling for production resilience.

---

## References

- [AWS EventBridge Scheduled Events](https://docs.aws.amazon.com/eventbridge/latest/userguide/scheduled-events.html)
- [EventBridge Cron Expressions](https://docs.aws.amazon.com/eventbridge/latest/userguide/scheduled-events.html#cron-expressions)
- [EventBridge Dead-Letter Queues](https://docs.aws.amazon.com/eventbridge/latest/userguide/rule-dlq.html)
- [AWS CDK EventBridge API Reference](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_events-readme.html)
