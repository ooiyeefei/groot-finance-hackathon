import { createHash, createVerify, X509Certificate } from 'node:crypto';
import type { ValidateDocumentResponse, ValidationChecks } from '../types';
import { removeSignatureFields, minifyJson } from './transform';

function checkSignatureComplete(doc: Record<string, unknown>): boolean {
  try {
    const invoice = (doc as { Invoice: Record<string, unknown>[] }).Invoice[0];
    if (!invoice.UBLExtensions || !invoice.Signature) return false;

    const ext = (invoice.UBLExtensions as unknown[])[0] as Record<string, unknown>;
    const ublExt = (ext.UBLExtension as unknown[])[0] as Record<string, unknown>;
    const extContent = (ublExt.ExtensionContent as unknown[])[0] as Record<string, unknown>;
    const docSigs = (extContent.UBLDocumentSignatures as unknown[])[0] as Record<string, unknown>;
    const sigInfo = (docSigs.SignatureInformation as unknown[])[0] as Record<string, unknown>;
    const sig = (sigInfo.Signature as unknown[])[0] as Record<string, unknown>;

    if (!sig.SignatureValue || !sig.KeyInfo || !sig.SignedInfo || !sig.Object) return false;

    const keyInfo = (sig.KeyInfo as unknown[])[0] as Record<string, unknown>;
    const x509Data = (keyInfo.X509Data as unknown[])[0] as Record<string, unknown>;
    if (!x509Data.X509Certificate) return false;

    return true;
  } catch {
    return false;
  }
}

function extractSignatureData(doc: Record<string, unknown>): {
  signatureValue: string;
  certBase64: string;
  docDigestInSig: string;
  propsDigestInSig: string;
} {
  const invoice = (doc as { Invoice: Record<string, unknown>[] }).Invoice[0];
  const ext = (invoice.UBLExtensions as unknown[])[0] as Record<string, unknown>;
  const ublExt = (ext.UBLExtension as unknown[])[0] as Record<string, unknown>;
  const extContent = (ublExt.ExtensionContent as unknown[])[0] as Record<string, unknown>;
  const docSigs = (extContent.UBLDocumentSignatures as unknown[])[0] as Record<string, unknown>;
  const sigInfo = (docSigs.SignatureInformation as unknown[])[0] as Record<string, unknown>;
  const sig = (sigInfo.Signature as unknown[])[0] as Record<string, unknown>;

  const signatureValue = ((sig.SignatureValue as unknown[])[0] as { _: string })._;
  const keyInfo = (sig.KeyInfo as unknown[])[0] as Record<string, unknown>;
  const x509Data = (keyInfo.X509Data as unknown[])[0] as Record<string, unknown>;
  const certBase64 = ((x509Data.X509Certificate as unknown[])[0] as { _: string })._;

  const signedInfo = (sig.SignedInfo as unknown[])[0] as Record<string, unknown>;
  const references = signedInfo.Reference as Record<string, unknown>[];

  // Identify references by Id or Type fields (position-independent)
  let docDigestInSig = '';
  let propsDigestInSig = '';
  for (const ref of references) {
    const digestValue = ((ref.DigestValue as { _: string }[])[0])._;
    if (ref.Id === 'id-doc-signed-data' || (ref.URI === '' && !ref.Type)) {
      docDigestInSig = digestValue;
    } else if (
      ref.Id === 'id-xades-signed-props' ||
      ref.Type === 'http://uri.etsi.org/01903/v1.3.2#SignedProperties'
    ) {
      propsDigestInSig = digestValue;
    }
  }

  return { signatureValue, certBase64, docDigestInSig, propsDigestInSig };
}

export function validateDocument(documentStr: string): ValidateDocumentResponse {
  const checks: ValidationChecks = {
    documentHash: false,
    certificateValid: false,
    signatureIntegrity: false,
    signatureComplete: false,
  };

  let doc: Record<string, unknown>;
  try {
    doc = JSON.parse(documentStr);
  } catch {
    return { valid: false, checks, error: 'Document is not valid JSON' };
  }

  // Check 1: Signature completeness
  checks.signatureComplete = checkSignatureComplete(doc);
  if (!checks.signatureComplete) {
    return {
      valid: false,
      checks,
      error: 'Signature block is missing or incomplete',
    };
  }

  const { signatureValue, certBase64, docDigestInSig } = extractSignatureData(doc);

  // Check 2: Document hash
  const cleaned = removeSignatureFields(doc);
  const minified = minifyJson(cleaned);
  const computedDocDigest = createHash('sha256')
    .update(Buffer.from(minified, 'utf-8'))
    .digest('base64');

  checks.documentHash = computedDocDigest === docDigestInSig;
  if (!checks.documentHash) {
    return {
      valid: false,
      checks,
      error: 'Document hash does not match — content may have been modified after signing',
    };
  }

  // Check 3: Signature integrity (RSA-SHA256 verification)
  try {
    const certPem =
      '-----BEGIN CERTIFICATE-----\n' +
      certBase64.match(/.{1,64}/g)!.join('\n') +
      '\n-----END CERTIFICATE-----';

    const verifier = createVerify('RSA-SHA256');
    verifier.update(Buffer.from(minified, 'utf-8'));
    checks.signatureIntegrity = verifier.verify(
      certPem,
      Buffer.from(signatureValue, 'base64')
    );
  } catch {
    checks.signatureIntegrity = false;
  }

  if (!checks.signatureIntegrity) {
    return {
      valid: false,
      checks,
      error: 'RSA-SHA256 signature verification failed',
    };
  }

  // Check 4: Certificate validity period
  try {
    const certDer = Buffer.from(certBase64, 'base64');
    const x509 = new X509Certificate(certDer);
    const now = new Date();
    checks.certificateValid =
      now >= new Date(x509.validFrom) && now <= new Date(x509.validTo);
  } catch {
    checks.certificateValid = false;
  }

  if (!checks.certificateValid) {
    return {
      valid: false,
      checks,
      error: 'Certificate is expired or not yet valid',
    };
  }

  return { valid: true, checks };
}
