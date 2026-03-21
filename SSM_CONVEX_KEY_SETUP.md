# Missing SSM Parameter: Convex Deployment Key

## Status
**Parameter `/finanseal/convex-deployment-key` does not exist in SSM Parameter Store**

## Action Required
Create the Convex deployment key parameter in AWS SSM.

### Steps

1. **Generate deployment key from Convex Dashboard**
   - Go to: https://dashboard.convex.dev/deployment/kindhearted-lynx-129/settings
   - Click "Generate deployment key"
   - Copy the key (format: `prod:...`)

2. **Store in SSM Parameter Store**
   ```bash
   aws ssm put-parameter \
     --name /finanseal/convex-deployment-key \
     --value "prod:YOUR_KEY_HERE" \
     --type SecureString \
     --profile groot-finanseal \
     --region us-west-2
   ```

3. **Verify parameter creation**
   ```bash
   aws ssm get-parameter \
     --name /finanseal/convex-deployment-key \
     --with-decryption \
     --profile groot-finanseal \
     --region us-west-2
   ```

4. **Test Convex HTTP API call**
   ```bash
   CONVEX_KEY=$(aws ssm get-parameter \
     --name /finanseal/convex-deployment-key \
     --with-decryption \
     --query 'Parameter.Value' \
     --output text \
     --profile groot-finanseal \
     --region us-west-2)

   curl -X POST https://kindhearted-lynx-129.convex.cloud/api/action \
     -H "Authorization: Convex $CONVEX_KEY" \
     -H "Content-Type: application/json" \
     -d '{"path": "functions/actionCenterJobs:runProactiveAnalysis", "args": {}}'
   ```

## Why This Is Needed
- EventBridge Lambda functions need to call Convex HTTP API endpoints
- Deployment key provides IAM-like authentication for backend-to-backend calls
- Required for: DSPy optimization cron, Action Center jobs, LHDN polling

## Security Notes
- Stored as SecureString (encrypted at rest with KMS)
- Only accessible by Lambda execution roles with SSM:GetParameter permission
- Never expose in frontend code or logs
