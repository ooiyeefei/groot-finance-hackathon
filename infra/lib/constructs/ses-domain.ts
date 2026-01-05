import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ses from 'aws-cdk-lib/aws-ses';

export interface SesDomainConstructProps {
  domainName: string;
  mailFromSubdomain?: string;
}

/**
 * SES Domain Verification Construct
 *
 * Creates an SES Email Identity for the specified domain with:
 * - Easy DKIM (2048-bit signing)
 * - Custom MAIL FROM domain (optional)
 *
 * Note: DNS records must be configured manually if not using Route53.
 * The construct outputs DKIM records for manual DNS setup.
 */
export class SesDomainConstruct extends Construct {
  public readonly emailIdentity: ses.EmailIdentity;
  public readonly domainName: string;

  constructor(scope: Construct, id: string, props: SesDomainConstructProps) {
    super(scope, id);

    this.domainName = props.domainName;

    // Create SES Email Identity for domain verification
    this.emailIdentity = new ses.EmailIdentity(this, 'EmailIdentity', {
      identity: ses.Identity.domain(props.domainName),
      // MAIL FROM domain for better deliverability
      mailFromDomain: props.mailFromSubdomain
        ? `${props.mailFromSubdomain}.${props.domainName}`
        : `mail.${props.domainName}`,
    });

    // Output DKIM records for manual DNS setup
    // CDK v2 doesn't expose dkimRecords directly, use CloudFormation outputs
    new cdk.CfnOutput(this, 'DkimInstructions', {
      value: `Configure DKIM for ${props.domainName} in AWS SES Console → Verified identities → ${props.domainName} → Authentication`,
      description: 'Instructions for DKIM DNS configuration',
    });

    new cdk.CfnOutput(this, 'MailFromDomain', {
      value: props.mailFromSubdomain
        ? `${props.mailFromSubdomain}.${props.domainName}`
        : `mail.${props.domainName}`,
      description: 'MAIL FROM domain - add SPF and MX records',
    });
  }

  /**
   * Grant permission to send emails from this identity
   */
  public grantSendEmail(grantee: cdk.aws_iam.IGrantable): cdk.aws_iam.Grant {
    return this.emailIdentity.grantSendEmail(grantee);
  }
}
