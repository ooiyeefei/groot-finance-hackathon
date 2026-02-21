import { createHash, createSign } from 'node:crypto';
import type {
  SigningCredentials,
  CertificateMetadata,
  SignDocumentResponse,
  SignatureComponents,
} from '../types';
import { SigningError, ERROR_CODES } from '../errors';
import { ensureNamespacePrefixes, removeSignatureFields, minifyJson } from './transform';
import { buildUBLExtensions, buildSignatureReference } from './signature-block';

export async function signDocument(
  documentStr: string,
  credentials: SigningCredentials,
  certMetadata: CertificateMetadata
): Promise<SignDocumentResponse> {
  try {
    // Step 1: Parse the document and ensure LHDN namespace prefixes
    const rawDoc = JSON.parse(documentStr) as Record<string, unknown>;
    const doc = ensureNamespacePrefixes(rawDoc);

    // Step 2: Transform — remove UBLExtensions/Signature, minify
    const cleaned = removeSignatureFields(doc);
    const minified = minifyJson(cleaned);
    const minifiedBytes = Buffer.from(minified, 'utf-8');

    // Step 3: Generate SHA-256 hash of transformed document (DocDigest)
    const docDigest = createHash('sha256').update(minifiedBytes).digest('base64');

    // Step 4: Sign the minified document bytes with RSA-SHA256
    const signer = createSign('RSA-SHA256');
    signer.update(minifiedBytes);
    const signatureValue = signer.sign(credentials.privateKeyPem, 'base64');

    // Step 5: Certificate hash (CertDigest) — SHA-256 of DER-encoded certificate
    const certDigest = createHash('sha256')
      .update(certMetadata.rawDer)
      .digest('base64');

    // Step 6: Populate signed properties
    const signingTime = new Date()
      .toISOString()
      .replace(/\.\d{3}Z$/, 'Z');

    // Step 7: Build and hash signed properties (PropsDigest)
    const signedPropsForHash = {
      Target: 'signature',
      SignedProperties: [
        {
          Id: 'id-xades-signed-props',
          SignedSignatureProperties: [
            {
              SigningTime: [{ _: signingTime }],
              SigningCertificate: [
                {
                  Cert: [
                    {
                      CertDigest: [
                        {
                          DigestMethod: [
                            {
                              _: '',
                              Algorithm:
                                'http://www.w3.org/2001/04/xmlenc#sha256',
                            },
                          ],
                          DigestValue: [{ _: certDigest }],
                        },
                      ],
                      IssuerSerial: [
                        {
                          X509IssuerName: [
                            { _: certMetadata.issuerName },
                          ],
                          X509SerialNumber: [
                            { _: certMetadata.serialNumberDecimal },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const propsMinified = JSON.stringify(signedPropsForHash);
    const propsDigest = createHash('sha256')
      .update(Buffer.from(propsMinified, 'utf-8'))
      .digest('base64');

    // Step 8: Build signature block and embed into document
    const certBase64 = certMetadata.rawDer.toString('base64');

    const components: SignatureComponents = {
      signatureValue,
      certBase64,
      certDigest,
      docDigest,
      propsDigest,
      signingTime,
      issuerName: certMetadata.issuerName,
      subjectName: certMetadata.subjectName,
      serialNumber: certMetadata.serialNumberDecimal,
    };

    const ublExtensions = buildUBLExtensions(components);
    const signatureRef = buildSignatureReference();

    // Embed into document (parse the minified version to ensure clean state)
    const finalDoc = JSON.parse(minified) as Record<string, unknown>;
    (finalDoc as { Invoice: Record<string, unknown>[] }).Invoice[0].UBLExtensions =
      ublExtensions;
    (finalDoc as { Invoice: Record<string, unknown>[] }).Invoice[0].Signature =
      signatureRef;

    const signedDocument = minifyJson(finalDoc);

    // Compute hash of final signed document (for LHDN submission API)
    const documentHash = createHash('sha256')
      .update(Buffer.from(signedDocument, 'utf-8'))
      .digest('base64');

    return {
      success: true,
      signedDocument,
      documentHash,
      signingTime,
    };
  } catch (err) {
    if (err instanceof SigningError) throw err;
    const message = err instanceof Error ? err.message : 'Unknown signing error';
    throw new SigningError(ERROR_CODES.SIGNING_FAILED, message);
  }
}
