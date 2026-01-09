import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

/**
 * Public Assets Stack
 *
 * Creates a public S3 bucket for static assets like:
 * - Favicon
 * - Brand logos
 * - Public images
 *
 * This bucket is separate from the private finanseal-bucket
 * to maintain clear security boundaries.
 */
export class PublicAssetsStack extends cdk.Stack {
  public readonly bucket: s3.Bucket;
  public readonly bucketUrl: string;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ========================================================================
    // Public S3 Bucket for Static Assets
    // ========================================================================
    this.bucket = new s3.Bucket(this, 'PublicAssetsBucket', {
      bucketName: 'finanseal-public',

      // Public read access for all objects
      publicReadAccess: true,
      blockPublicAccess: new s3.BlockPublicAccess({
        blockPublicAcls: false,
        ignorePublicAcls: false,
        blockPublicPolicy: false,
        restrictPublicBuckets: false,
      }),

      // CORS configuration for browser access
      cors: [
        {
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.HEAD],
          allowedOrigins: ['*'], // Allow all origins for public assets
          allowedHeaders: ['*'],
          maxAge: 86400, // 24 hours cache for CORS preflight
        },
      ],

      // Lifecycle rules for cost optimization
      lifecycleRules: [
        {
          // Clean up incomplete multipart uploads after 7 days
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(7),
        },
      ],

      // Versioning disabled for static assets (not needed)
      versioned: false,

      // Removal policy - RETAIN to prevent accidental deletion
      removalPolicy: cdk.RemovalPolicy.RETAIN,

      // Object ownership - bucket owner enforced for simplicity
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
    });

    // Store the bucket URL for easy access
    this.bucketUrl = `https://${this.bucket.bucketName}.s3.${this.region}.amazonaws.com`;

    // ========================================================================
    // Bucket Policy for Public Read Access with Referer Restriction
    //
    // Security: Only allow requests from FinanSEAL domains to prevent hotlinking.
    // This is a free security measure that doesn't require CloudFront.
    // ========================================================================
    this.bucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'PublicReadWithRefererCheck',
        effect: iam.Effect.ALLOW,
        principals: [new iam.AnyPrincipal()],
        actions: ['s3:GetObject'],
        resources: [`${this.bucket.bucketArn}/*`],
        conditions: {
          StringLike: {
            'aws:Referer': [
              'https://hellogroot.com/*',
              'https://*.hellogroot.com/*',
              'https://finance.hellogroot.com/*',
              'https://finanseal-*.vercel.app/*',
              'https://*.vercel.app/*',
              'http://localhost:*/*',
              'http://127.0.0.1:*/*',
            ],
          },
        },
      })
    );

    // Allow direct access for favicons and essential assets (no referer for browser favicon requests)
    this.bucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'DirectAccessForEssentialAssets',
        effect: iam.Effect.ALLOW,
        principals: [new iam.AnyPrincipal()],
        actions: ['s3:GetObject'],
        resources: [
          `${this.bucket.bucketArn}/favicon.svg`,
          `${this.bucket.bucketArn}/favicon.ico`,
          `${this.bucket.bucketArn}/apple-touch-icon.png`,
          `${this.bucket.bucketArn}/robots.txt`,
        ],
      })
    );

    // ========================================================================
    // IAM Policy for Upload Access (for CI/CD or admin uploads)
    // ========================================================================
    // Allow the Vercel OIDC role to upload assets
    const vercelOidcRoleArn = 'arn:aws:iam::837224017779:role/FinanSEAL-Vercel-S3-Role';

    this.bucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'VercelUploadAccess',
        effect: iam.Effect.ALLOW,
        principals: [new iam.ArnPrincipal(vercelOidcRoleArn)],
        actions: ['s3:PutObject', 's3:DeleteObject'],
        resources: [`${this.bucket.bucketArn}/*`],
      })
    );

    // ========================================================================
    // Outputs
    // ========================================================================
    new cdk.CfnOutput(this, 'BucketName', {
      value: this.bucket.bucketName,
      description: 'Public assets bucket name',
      exportName: `${id}-BucketName`,
    });

    new cdk.CfnOutput(this, 'BucketUrl', {
      value: this.bucketUrl,
      description: 'Public assets bucket URL',
      exportName: `${id}-BucketUrl`,
    });

    new cdk.CfnOutput(this, 'BucketArn', {
      value: this.bucket.bucketArn,
      description: 'Public assets bucket ARN',
      exportName: `${id}-BucketArn`,
    });
  }
}
