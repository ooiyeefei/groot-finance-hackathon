import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ssm from 'aws-cdk-lib/aws-ssm';

export class APNsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // APNs Private Key (P8 format) — stored as SecureString (free tier)
    // Value must be set manually in AWS Console after deployment:
    //   aws ssm put-parameter --name /finanseal/prod/apns-private-key \
    //     --type SecureString --value "$(cat AuthKey_XXXXXXXXXX.p8)" \
    //     --overwrite --profile groot-finanseal --region us-west-2
    new ssm.StringParameter(this, 'APNsPrivateKeyPlaceholder', {
      parameterName: '/finanseal/prod/apns-private-key',
      stringValue: 'PLACEHOLDER_REPLACE_WITH_P8_KEY',
      description: 'APNs authentication private key (P8 format). Replace with actual key via CLI as SecureString.',
      tier: ssm.ParameterTier.STANDARD,
    });

    // APNs Key ID — from Apple Developer Portal > Keys
    new ssm.StringParameter(this, 'APNsKeyId', {
      parameterName: '/finanseal/prod/apns-key-id',
      stringValue: 'PLACEHOLDER_REPLACE_WITH_KEY_ID',
      description: 'APNs authentication key ID from Apple Developer Portal',
      tier: ssm.ParameterTier.STANDARD,
    });

    // APNs Team ID — from Apple Developer Portal > Membership
    new ssm.StringParameter(this, 'APNsTeamId', {
      parameterName: '/finanseal/prod/apns-team-id',
      stringValue: 'PLACEHOLDER_REPLACE_WITH_TEAM_ID',
      description: 'Apple Developer Team ID',
      tier: ssm.ParameterTier.STANDARD,
    });

    // Output the parameter names for reference
    new cdk.CfnOutput(this, 'APNsPrivateKeyParam', {
      value: '/finanseal/prod/apns-private-key',
      description: 'SSM parameter name for APNs private key',
    });
    new cdk.CfnOutput(this, 'APNsKeyIdParam', {
      value: '/finanseal/prod/apns-key-id',
      description: 'SSM parameter name for APNs key ID',
    });
    new cdk.CfnOutput(this, 'APNsTeamIdParam', {
      value: '/finanseal/prod/apns-team-id',
      description: 'SSM parameter name for APNs team ID',
    });
  }
}
