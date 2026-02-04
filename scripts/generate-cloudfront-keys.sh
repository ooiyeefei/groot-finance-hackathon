#!/bin/bash

# Generate RSA key pair for CloudFront signed URLs
# The private key is used to sign URLs, the public key is uploaded to CloudFront

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
SECRETS_DIR="$PROJECT_ROOT/secrets"

echo "🔐 Generating CloudFront signing key pair..."

# Create secrets directory if it doesn't exist
mkdir -p "$SECRETS_DIR"

# Generate 2048-bit RSA private key
openssl genrsa -out "$SECRETS_DIR/cloudfront-private-key.pem" 2048

# Extract public key in the format CloudFront expects
openssl rsa -pubout -in "$SECRETS_DIR/cloudfront-private-key.pem" -out "$SECRETS_DIR/cloudfront-public-key.pem"

# Set restrictive permissions on private key
chmod 600 "$SECRETS_DIR/cloudfront-private-key.pem"
chmod 644 "$SECRETS_DIR/cloudfront-public-key.pem"

echo ""
echo "✅ Keys generated successfully!"
echo ""
echo "📁 Files created:"
echo "   - $SECRETS_DIR/cloudfront-private-key.pem (KEEP SECRET!)"
echo "   - $SECRETS_DIR/cloudfront-public-key.pem"
echo ""
echo "🔒 IMPORTANT: Add the private key to your environment:"
echo ""
echo "   # For local development (.env.local):"
echo "   CLOUDFRONT_PRIVATE_KEY=\"\$(cat secrets/cloudfront-private-key.pem)\""
echo ""
echo "   # For Vercel, add as environment variable (paste the key content):"
echo "   vercel env add CLOUDFRONT_PRIVATE_KEY"
echo ""
echo "📤 Next steps:"
echo "   1. Deploy CDK stack: cd infra && npx cdk deploy FinansealCdnStack --profile groot-finanseal"
echo "   2. Add CLOUDFRONT_PRIVATE_KEY to Vercel environment variables"
echo "   3. Add CLOUDFRONT_KEY_PAIR_ID and CLOUDFRONT_DOMAIN to Vercel (from CDK outputs)"
echo ""

# Check if secrets is in .gitignore
if ! grep -q "^secrets/" "$PROJECT_ROOT/.gitignore" 2>/dev/null; then
  echo "⚠️  WARNING: 'secrets/' is not in .gitignore!"
  echo "   Adding it now..."
  echo "" >> "$PROJECT_ROOT/.gitignore"
  echo "# CloudFront signing keys" >> "$PROJECT_ROOT/.gitignore"
  echo "secrets/" >> "$PROJECT_ROOT/.gitignore"
  echo "✅ Added 'secrets/' to .gitignore"
fi
