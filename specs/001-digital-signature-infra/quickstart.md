# Quickstart: Digital Signature Infrastructure

**Branch**: `001-digital-signature-infra` | **Date**: 2026-02-20

## Prerequisites

- Node.js 20.x
- AWS CLI configured with `groot-finanseal` profile
- AWS CDK CLI (`npx cdk`)
- An X.509 certificate and RSA private key (self-signed for sandbox testing)

## 1. Generate a Self-Signed Test Certificate

For sandbox/development testing only:

```bash
# Generate RSA-2048 private key + self-signed certificate (valid 365 days)
openssl req -x509 -newkey rsa:2048 -keyout test-private-key.pem -out test-certificate.pem \
  -days 365 -nodes -subj "/CN=FinanSEAL Test/O=FinanSEAL/C=MY"
```

## 2. Store Credentials in SSM Parameter Store

```bash
# Store private key
aws ssm put-parameter \
  --name "/finanseal/sandbox/digital-signature/private-key" \
  --type SecureString \
  --value "$(cat test-private-key.pem)" \
  --profile groot-finanseal \
  --region us-west-2

# Store certificate
aws ssm put-parameter \
  --name "/finanseal/sandbox/digital-signature/certificate" \
  --type SecureString \
  --value "$(cat test-certificate.pem)" \
  --profile groot-finanseal \
  --region us-west-2
```

## 3. Deploy the Signing Lambda

```bash
cd infra
npx cdk deploy FinansealDigitalSignatureStack --profile groot-finanseal --region us-west-2
```

## 4. Test Signing

```bash
# Invoke the signing Lambda with a sample unsigned document
aws lambda invoke \
  --function-name finanseal-digital-signature:prod \
  --payload '{"action":"sign","document":"{\"_D\":\"urn:oasis:names:specification:ubl:schema:xsd:Invoice-2\",\"Invoice\":[{\"ID\":[{\"_\":\"INV-001\"}]}]}"}' \
  --profile groot-finanseal \
  --region us-west-2 \
  output.json

cat output.json
```

## 5. Test Validation

```bash
# Use the signed output from step 4 as input
SIGNED_DOC=$(cat output.json | jq -r '.signedDocument')

aws lambda invoke \
  --function-name finanseal-digital-signature:prod \
  --payload "{\"action\":\"validate\",\"document\":$(echo $SIGNED_DOC | jq -Rs .)}" \
  --profile groot-finanseal \
  --region us-west-2 \
  validate-output.json

cat validate-output.json
```

## Project Structure

```
infra/
├── bin/digital-signature.ts               # CDK app entry point
├── lib/digital-signature-stack.ts         # CDK stack definition
src/lambda/
└── digital-signature/
    ├── handler.ts                         # Lambda entry point (routes sign/validate)
    ├── signing/
    │   ├── sign-document.ts               # 8-step signing workflow
    │   ├── validate-document.ts           # Signature validation
    │   ├── transform.ts                   # JSON transformation & minification
    │   └── signature-block.ts             # Signature block JSON construction
    ├── credentials/
    │   └── ssm-credential-provider.ts     # SSM Parameter Store credential retrieval
    ├── types.ts                           # Shared TypeScript interfaces
    └── errors.ts                          # Error codes and error classes
```

## Key Technical Notes

- **JSON canonicalization** = `JSON.stringify()` without spaces (Node.js default compact output)
- **What gets signed** (RSA-SHA256): The full minified document bytes (after removing UBLExtensions/Signature)
- **Certificate serial**: Must be decimal string — convert from Node.js hex via `BigInt('0x' + hex).toString(10)`
- **Signing time**: `YYYY-MM-DDTHH:MM:SSZ` format (no milliseconds)
- **Document hash for LHDN API**: SHA-256 of the final signed document (separate from the internal document digest)
