# AWS IAM Setup for FinanSeal S3 Access

## Prerequisites
- AWS Console access with IAM admin permissions
- Account ID: `837224017779`
- S3 Bucket: `finanseal-bucket`
- Region: `us-west-2`

## Step 1: Create IAM Policy

1. Go to **IAM → Policies → Create policy**
2. Click **JSON** tab and paste:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "FinansealS3ListBucket",
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket"
      ],
      "Resource": "arn:aws:s3:::finanseal-bucket"
    },
    {
      "Sid": "FinansealS3ObjectAccess",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::finanseal-bucket/*"
    }
  ]
}
```

3. Click **Next**
4. Name: `FinansealS3Access`
5. Click **Create policy**

## Step 2: Create IAM User (for Trigger.dev & Development)

1. Go to **IAM → Users → Create user**
2. User name: `finanseal-s3-service`
3. Click **Next**
4. Select **Attach policies directly**
5. Search and select `FinansealS3Access`
6. Click **Next → Create user**

## Step 3: Create Access Keys

1. Click on the user `finanseal-s3-service`
2. Go to **Security credentials** tab
3. Click **Create access key**
4. Select **Application running outside AWS**
5. Click **Next → Create access key**
6. **IMPORTANT**: Copy and save the Access Key ID and Secret Access Key

## Step 4: Add to Environment Variables

Add to your `.env.local` and Vercel/Trigger.dev environment:

```env
AWS_ACCESS_KEY_ID=AKIA...your_access_key...
AWS_SECRET_ACCESS_KEY=...your_secret_key...
AWS_REGION=us-west-2
S3_BUCKET_NAME=finanseal-bucket
```

---

## Optional: OIDC Setup for Vercel (Requires Pro Plan)

If you have Vercel Pro and want zero-credential deployment:

### Step 1: Get Vercel Team ID
- Vercel Dashboard → Settings → General → Team ID

### Step 2: Create OIDC Identity Provider

1. Go to **IAM → Identity providers → Add provider**
2. Provider type: **OpenID Connect**
3. Provider URL: `https://oidc.vercel.com`
4. Audience: `YOUR_VERCEL_TEAM_ID`
5. Click **Add provider**

### Step 3: Create IAM Role for OIDC

1. Go to **IAM → Roles → Create role**
2. Trusted entity: **Web identity**
3. Identity provider: `oidc.vercel.com`
4. Audience: `YOUR_VERCEL_TEAM_ID`
5. Click **Next**
6. Attach `FinansealS3Access` policy
7. Role name: `FinansealVercelOIDCRole`
8. Click **Create role**

### Step 4: Add Trust Policy Condition

Edit the role's trust policy to restrict to your project:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::837224017779:oidc-provider/oidc.vercel.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "oidc.vercel.com:aud": "YOUR_VERCEL_TEAM_ID"
        },
        "StringLike": {
          "oidc.vercel.com:sub": "owner:YOUR_VERCEL_TEAM_ID:project:finanseal:environment:*"
        }
      }
    }
  ]
}
```

### Step 5: Update Environment

In Vercel, add:
```env
AWS_ROLE_ARN=arn:aws:iam::837224017779:role/FinansealVercelOIDCRole
```

---

## Verification

After setup, run:
```bash
# Test with the new credentials
AWS_ACCESS_KEY_ID=your_key AWS_SECRET_ACCESS_KEY=your_secret aws s3 ls s3://finanseal-bucket/ --region us-west-2
```

Should list the prefixes: `invoices/`, `expense_claims/`, `business-profiles/`
