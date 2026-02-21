import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { X509Certificate, createSign, createVerify } from 'node:crypto';
import type { SigningCredentials, CertificateMetadata } from '../types';
import { SigningError, ERROR_CODES } from '../errors';

// WARNING: Never log credential values (private key PEM, certificate PEM, or decrypted SecureString values).
// Only log parameter names, error codes, and certificate metadata (issuer, serial, expiry dates).

const ssm = new SSMClient({});

let cachedCredentials: SigningCredentials | null = null;
let cachedCertMetadata: CertificateMetadata | null = null;
let cachedExpiryDays: number | null = null;

function getParameterPath(env: string, name: string): string {
  return `/finanseal/${env}/digital-signature/${name}`;
}

async function fetchParameter(path: string): Promise<string> {
  try {
    const result = await ssm.send(
      new GetParameterCommand({ Name: path, WithDecryption: true })
    );
    if (!result.Parameter?.Value) {
      throw new Error(`Empty value for parameter ${path}`);
    }
    return result.Parameter.Value;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown SSM error';
    throw new SigningError(
      ERROR_CODES.CREDENTIAL_UNAVAILABLE,
      `Failed to retrieve parameter ${path}: ${message}`
    );
  }
}

function formatDistinguishedName(dn: string): string {
  // Node.js X509Certificate returns DN with newline-separated components
  // in least-specific-first order (C, O, OU, CN). LHDN expects
  // comma-separated, most-specific-first (RFC 2253: CN, OU, O, C).
  const parts = dn.split('\n').filter(Boolean);
  return parts.reverse().join(', ');
}

function parseCertificate(certPem: string): CertificateMetadata {
  const x509 = new X509Certificate(certPem);
  const hexSerial = x509.serialNumber;
  const serialDecimal = BigInt('0x' + hexSerial).toString(10);

  return {
    issuerName: formatDistinguishedName(x509.issuer),
    subjectName: formatDistinguishedName(x509.subject),
    serialNumberDecimal: serialDecimal,
    validFrom: new Date(x509.validFrom),
    validTo: new Date(x509.validTo),
    rawDer: Buffer.from(x509.raw),
  };
}

function validateCertificateValidity(meta: CertificateMetadata): void {
  const now = new Date();
  if (now < meta.validFrom) {
    throw new SigningError(
      ERROR_CODES.CERTIFICATE_NOT_YET_VALID,
      `Certificate not valid until ${meta.validFrom.toISOString()}`
    );
  }
  if (now > meta.validTo) {
    throw new SigningError(
      ERROR_CODES.CERTIFICATE_EXPIRED,
      `Certificate expired on ${meta.validTo.toISOString()}`
    );
  }
}

function validateKeyCertMatch(privateKeyPem: string, certPem: string): void {
  const testData = Buffer.from('key-cert-match-test');
  try {
    const signer = createSign('RSA-SHA256');
    signer.update(testData);
    const signature = signer.sign(privateKeyPem);

    const verifier = createVerify('RSA-SHA256');
    verifier.update(testData);
    const isValid = verifier.verify(certPem, signature);

    if (!isValid) {
      throw new SigningError(
        ERROR_CODES.KEY_CERT_MISMATCH,
        'Private key does not match the certificate public key'
      );
    }
  } catch (err) {
    if (err instanceof SigningError) throw err;
    throw new SigningError(
      ERROR_CODES.KEY_CERT_MISMATCH,
      'Failed to verify key-certificate match'
    );
  }
}

export async function getCredentials(
  environment: string
): Promise<{ credentials: SigningCredentials; metadata: CertificateMetadata }> {
  if (cachedCredentials && cachedCertMetadata) {
    // Re-validate expiry on each call (cert may have expired since cache)
    validateCertificateValidity(cachedCertMetadata);
    return { credentials: cachedCredentials, metadata: cachedCertMetadata };
  }

  const privateKeyPem = await fetchParameter(
    getParameterPath(environment, 'private-key')
  );
  const certificatePem = await fetchParameter(
    getParameterPath(environment, 'certificate')
  );

  let certificateChainPem: string | undefined;
  try {
    certificateChainPem = await fetchParameter(
      getParameterPath(environment, 'certificate-chain')
    );
  } catch {
    // Certificate chain is optional
  }

  const metadata = parseCertificate(certificatePem);
  validateCertificateValidity(metadata);
  validateKeyCertMatch(privateKeyPem, certificatePem);

  cachedCredentials = { privateKeyPem, certificatePem, certificateChainPem };
  cachedCertMetadata = metadata;

  // Compute and cache expiry days
  const msUntilExpiry = metadata.validTo.getTime() - Date.now();
  cachedExpiryDays = Math.floor(msUntilExpiry / (1000 * 60 * 60 * 24));

  if (cachedExpiryDays <= 30) {
    console.warn(
      `Certificate expiring in ${cachedExpiryDays} days (expires: ${metadata.validTo.toISOString()})`
    );
  }

  console.log(
    `Credentials loaded. Certificate issuer: ${metadata.issuerName}, ` +
      `serial: ${metadata.serialNumberDecimal}, ` +
      `expires: ${metadata.validTo.toISOString()} (${cachedExpiryDays} days)`
  );

  return { credentials: cachedCredentials, metadata: cachedCertMetadata };
}

export function getCertificateExpiryDays(): number | null {
  return cachedExpiryDays;
}

export function clearCache(): void {
  cachedCredentials = null;
  cachedCertMetadata = null;
  cachedExpiryDays = null;
}
