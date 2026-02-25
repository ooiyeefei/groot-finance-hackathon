import * as cdk from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import * as fs from 'fs';
import * as path from 'path';

/**
 * CDN Stack for Groot Finance
 *
 * Creates a CloudFront distribution for serving private S3 content (receipts, invoices).
 * Uses Origin Access Control (OAC) for secure S3 access.
 * Supports signed URLs for private content access.
 *
 * Benefits:
 * - Edge caching (faster loads from nearest location)
 * - Reduced S3 costs (less direct S3 requests)
 * - Better security (S3 not directly exposed)
 * - Free tier: 1TB transfer + 10M requests/month
 */
export class CdnStack extends cdk.Stack {
  public readonly distribution: cloudfront.Distribution;
  public readonly distributionDomainName: string;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ========================================================================
    // Reference existing S3 bucket (finanseal-bucket)
    // ========================================================================
    const bucket = s3.Bucket.fromBucketName(
      this,
      'FinansealBucket',
      'finanseal-bucket'
    );

    // ========================================================================
    // Origin Access Control (OAC) - Modern approach for S3 access
    // ========================================================================
    const oac = new cloudfront.S3OriginAccessControl(this, 'OAC', {
      description: 'OAC for Groot Finance private documents',
      originAccessControlName: 'finanseal-documents-oac',
      signing: cloudfront.Signing.SIGV4_ALWAYS,
    });

    // ========================================================================
    // CloudFront Key Group for Signed URLs
    // ========================================================================
    // Create a public key for signed URL verification
    // The private key will be stored as environment variable for the app to use
    const publicKeyPath = path.join(__dirname, '../../secrets/cloudfront-public-key.pem');
    let publicKeyContent: string;

    if (fs.existsSync(publicKeyPath)) {
      publicKeyContent = fs.readFileSync(publicKeyPath, 'utf-8').trim();
      console.log('✅ Loaded CloudFront public key from secrets/cloudfront-public-key.pem');
    } else {
      throw new Error(
        'CloudFront public key not found. Run: npm run cdn:generate-keys first'
      );
    }

    const publicKey = new cloudfront.PublicKey(this, 'SigningPublicKey', {
      publicKeyName: 'finanseal-cdn-signing-key',
      encodedKey: publicKeyContent,
      comment: 'Public key for CloudFront signed URLs',
    });

    const keyGroup = new cloudfront.KeyGroup(this, 'SigningKeyGroup', {
      keyGroupName: 'finanseal-cdn-key-group',
      items: [publicKey],
      comment: 'Key group for Groot Finance signed URLs',
    });

    // ========================================================================
    // CloudFront Distribution
    // ========================================================================
    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: 'Groot Finance CDN for private documents',

      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(bucket, {
          originAccessControl: oac,
        }),

        // Viewer protocol policy - HTTPS only for security
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,

        // Cache policy - optimize for images
        cachePolicy: new cloudfront.CachePolicy(this, 'ImageCachePolicy', {
          cachePolicyName: 'finanseal-image-cache',
          comment: 'Cache policy for receipt/invoice images',
          defaultTtl: cdk.Duration.days(1),
          maxTtl: cdk.Duration.days(7),
          minTtl: cdk.Duration.hours(1),
          // Don't cache based on query strings (signed URL params are in query)
          queryStringBehavior: cloudfront.CacheQueryStringBehavior.none(),
          headerBehavior: cloudfront.CacheHeaderBehavior.none(),
          cookieBehavior: cloudfront.CacheCookieBehavior.none(),
          enableAcceptEncodingGzip: true,
          enableAcceptEncodingBrotli: true,
        }),

        // Require signed URLs for all content
        trustedKeyGroups: [keyGroup],

        // Allow GET and HEAD only
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,

        // Compress responses
        compress: true,
      },

      // Price class - Use only North America and Europe for cost savings
      // Change to PriceClass.PRICE_CLASS_ALL for global coverage
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,

      // Enable HTTP/2 and HTTP/3 for better performance
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,

      // Enable IPv6
      enableIpv6: true,

      // Minimum SSL/TLS version
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
    });

    this.distributionDomainName = this.distribution.distributionDomainName;

    // ========================================================================
    // S3 Bucket Policy for CloudFront OAC
    // ========================================================================
    // Add bucket policy to allow CloudFront OAC to access the bucket
    const bucketPolicyStatement = new iam.PolicyStatement({
      sid: 'AllowCloudFrontServicePrincipalReadOnly',
      effect: iam.Effect.ALLOW,
      principals: [new iam.ServicePrincipal('cloudfront.amazonaws.com')],
      actions: ['s3:GetObject'],
      resources: [`arn:aws:s3:::finanseal-bucket/*`],
      conditions: {
        StringEquals: {
          'AWS:SourceArn': `arn:aws:cloudfront::${this.account}:distribution/${this.distribution.distributionId}`,
        },
      },
    });

    // Note: Since we're using an imported bucket, we need to add the policy manually via CLI
    // Output the policy for manual addition
    new cdk.CfnOutput(this, 'BucketPolicyStatement', {
      value: JSON.stringify({
        Sid: 'AllowCloudFrontServicePrincipalReadOnly',
        Effect: 'Allow',
        Principal: {
          Service: 'cloudfront.amazonaws.com',
        },
        Action: 's3:GetObject',
        Resource: 'arn:aws:s3:::finanseal-bucket/*',
        Condition: {
          StringEquals: {
            'AWS:SourceArn': `arn:aws:cloudfront::${this.account}:distribution/${this.distribution.distributionId}`,
          },
        },
      }),
      description: 'Add this policy to finanseal-bucket to allow CloudFront access',
    });

    // ========================================================================
    // Store CloudFront Key Pair ID in SSM for the application
    // ========================================================================
    new ssm.StringParameter(this, 'KeyPairIdParam', {
      parameterName: '/finanseal/cloudfront/key-pair-id',
      stringValue: publicKey.publicKeyId,
      description: 'CloudFront Key Pair ID for signed URLs',
    });

    new ssm.StringParameter(this, 'DistributionDomainParam', {
      parameterName: '/finanseal/cloudfront/distribution-domain',
      stringValue: this.distribution.distributionDomainName,
      description: 'CloudFront distribution domain name',
    });

    // ========================================================================
    // Outputs
    // ========================================================================
    new cdk.CfnOutput(this, 'DistributionId', {
      value: this.distribution.distributionId,
      description: 'CloudFront distribution ID',
      exportName: `${id}-DistributionId`,
    });

    new cdk.CfnOutput(this, 'DistributionDomainName', {
      value: this.distribution.distributionDomainName,
      description: 'CloudFront distribution domain name',
      exportName: `${id}-DistributionDomainName`,
    });

    new cdk.CfnOutput(this, 'DistributionUrl', {
      value: `https://${this.distribution.distributionDomainName}`,
      description: 'CloudFront distribution URL',
      exportName: `${id}-DistributionUrl`,
    });

    new cdk.CfnOutput(this, 'PublicKeyId', {
      value: publicKey.publicKeyId,
      description: 'CloudFront public key ID for signed URLs',
      exportName: `${id}-PublicKeyId`,
    });
  }
}
