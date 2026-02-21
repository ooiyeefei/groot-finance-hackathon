/**
 * UAT Test: End-to-end digital signature signing + validation
 *
 * Tests the full LHDN 8-step signing workflow locally using a self-signed certificate.
 * No AWS dependencies required — exercises the core crypto logic directly.
 *
 * Usage: node tests/uat-signing.mjs
 */

import { createHash, createSign, createVerify, generateKeyPairSync, X509Certificate } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ============================================================
// Test utilities
// ============================================================
let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  PASS: ${label}`);
    passed++;
  } else {
    console.error(`  FAIL: ${label}`);
    failed++;
  }
}

function assertEq(actual, expected, label) {
  assert(actual === expected, `${label} (expected=${expected}, got=${actual})`);
}

// ============================================================
// Generate self-signed RSA-2048 certificate via openssl
// ============================================================
console.log('\n=== Generating self-signed RSA-2048 certificate ===\n');

const tmpDir = mkdtempSync(join(tmpdir(), 'uat-signing-'));

try {
  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048',
    '-keyout', join(tmpDir, 'key.pem'),
    '-out', join(tmpDir, 'cert.pem'),
    '-days', '365', '-nodes',
    '-subj', '/CN=FinanSEAL UAT/O=FinanSEAL/C=MY',
  ], { stdio: 'pipe' });
} catch (err) {
  console.error('ERROR: openssl is required for UAT test. Please install openssl.');
  process.exit(1);
}

const privateKeyPem = readFileSync(join(tmpDir, 'key.pem'), 'utf-8');
const certificatePem = readFileSync(join(tmpDir, 'cert.pem'), 'utf-8');

// Parse certificate metadata
const x509 = new X509Certificate(certificatePem);
const hexSerial = x509.serialNumber;
const serialDecimal = BigInt('0x' + hexSerial).toString(10);

// Node.js returns DN with newline-separated components in least-specific-first order.
// LHDN expects comma-separated, most-specific-first (RFC 2253: CN, OU, O, C).
function formatDN(dn) {
  return dn.split('\n').filter(Boolean).reverse().join(', ');
}

const issuerName = formatDN(x509.issuer);
const subjectName = formatDN(x509.subject);
const rawDer = Buffer.from(x509.raw);
const certBase64 = rawDer.toString('base64');

console.log(`  Subject: ${subjectName}`);
console.log(`  Issuer: ${issuerName}`);
console.log(`  Serial (hex): ${hexSerial}`);
console.log(`  Serial (dec): ${serialDecimal}`);
console.log(`  Valid from: ${x509.validFrom}`);
console.log(`  Valid to:   ${x509.validTo}`);
console.log(`  DER size:   ${rawDer.length} bytes`);

// ============================================================
// Helper functions (mirror production code in transform.ts)
// ============================================================

const UBL_NAMESPACES = {
  _D: 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
  _A: 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
  _B: 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
};

const LHDN_MARKER = '\0LHDN:';

function ensureNamespacePrefixes(doc) {
  if (doc._D && doc._A && doc._B) return doc;
  return { ...UBL_NAMESPACES, ...doc };
}

function removeSignatureFields(doc) {
  const clone = JSON.parse(JSON.stringify(doc));
  const invoice = clone.Invoice;
  if (invoice && Array.isArray(invoice) && invoice.length > 0) {
    delete invoice[0].UBLExtensions;
    delete invoice[0].Signature;
  }
  return clone;
}

function formatLhdnNumber(n) {
  if (Number.isInteger(n)) return n.toString() + '.0';
  return String(n);
}

function markNumbers(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'number') return LHDN_MARKER + formatLhdnNumber(value);
  if (Array.isArray(value)) return value.map(markNumbers);
  if (typeof value === 'object') {
    const result = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = markNumbers(v);
    }
    return result;
  }
  return value;
}

function minifyJson(input) {
  const obj = typeof input === 'string' ? JSON.parse(input) : input;
  const marked = markNumbers(obj);
  const json = JSON.stringify(marked);
  return json.replace(/"\\u0000LHDN:([^"]*)"/g, '$1');
}

// ============================================================
// Test 1: removeSignatureFields + minifyJson
// ============================================================
console.log('\n=== Test 1: Document Transformation (Step 2) ===\n');

const sampleInvoice = {
  Invoice: [
    {
      ID: [{ _: 'INV-001' }],
      IssueDate: [{ _: '2026-02-20' }],
      InvoiceTypeCode: [{ _: '01', listVersionID: '1.1' }],
      DocumentCurrencyCode: [{ _: 'MYR' }],
      AccountingSupplierParty: [
        {
          Party: [
            {
              PartyIdentification: [{ ID: [{ _: 'C12345678', schemeID: 'TIN' }] }],
              PartyLegalEntity: [{ RegistrationName: [{ _: 'Test Supplier Sdn Bhd' }] }],
            },
          ],
        },
      ],
      AccountingCustomerParty: [
        {
          Party: [
            {
              PartyIdentification: [{ ID: [{ _: 'C87654321', schemeID: 'TIN' }] }],
              PartyLegalEntity: [{ RegistrationName: [{ _: 'Test Buyer Sdn Bhd' }] }],
            },
          ],
        },
      ],
      LegalMonetaryTotal: [
        {
          PayableAmount: [{ _: 1000.0, currencyID: 'MYR' }],
          TaxExclusiveAmount: [{ _: 1000.0, currencyID: 'MYR' }],
        },
      ],
      // These should be removed by transformation
      UBLExtensions: [{ existing: 'should-be-removed' }],
      Signature: [{ existing: 'should-be-removed' }],
    },
  ],
};

const withPrefixes = ensureNamespacePrefixes(sampleInvoice);
const cleaned = removeSignatureFields(withPrefixes);
assert(!cleaned.Invoice[0].UBLExtensions, 'UBLExtensions removed from Invoice');
assert(!cleaned.Invoice[0].Signature, 'Signature removed from Invoice');
assert(cleaned.Invoice[0].ID[0]._ === 'INV-001', 'Other fields preserved');

const minified = minifyJson(cleaned);
assert(typeof minified === 'string', 'Minified output is string');
assert(!minified.includes('\n'), 'No newlines in minified output');
assert(!minified.includes('  '), 'No extra spaces in minified output');

// ============================================================
// Test 1b: Namespace Prefix Injection
// ============================================================
console.log('\n=== Test 1b: Namespace Prefix Injection ===\n');

// Missing prefixes → injected
const docNoPrefixes = { Invoice: [{ ID: [{ _: 'TEST' }] }] };
const injected = ensureNamespacePrefixes(docNoPrefixes);
assertEq(injected._D, UBL_NAMESPACES._D, 'Missing _D prefix injected');
assertEq(injected._A, UBL_NAMESPACES._A, 'Missing _A prefix injected');
assertEq(injected._B, UBL_NAMESPACES._B, 'Missing _B prefix injected');
assert(injected.Invoice, 'Invoice preserved after injection');

// Existing prefixes → preserved (not overwritten)
const docWithPrefixes = {
  _D: 'custom-D',
  _A: 'custom-A',
  _B: 'custom-B',
  Invoice: [{ ID: [{ _: 'TEST' }] }],
};
const preserved = ensureNamespacePrefixes(docWithPrefixes);
assertEq(preserved._D, 'custom-D', 'Existing _D prefix preserved');
assertEq(preserved._A, 'custom-A', 'Existing _A prefix preserved');
assertEq(preserved._B, 'custom-B', 'Existing _B prefix preserved');

// Namespace ordering: prefixes come before Invoice in serialized JSON
const serialized = minifyJson(injected);
const dIdx = serialized.indexOf('"_D"');
const invoiceIdx = serialized.indexOf('"Invoice"');
assert(dIdx < invoiceIdx, 'Namespace prefixes appear before Invoice in JSON');

// ============================================================
// Test 1c: LHDN Decimal Formatting
// ============================================================
console.log('\n=== Test 1c: LHDN Decimal Formatting ===\n');

assertEq(minifyJson({ v: 1 }), '{"v":1.0}', 'Integer 1 → 1.0');
assertEq(minifyJson({ v: 1000 }), '{"v":1000.0}', 'Integer 1000 → 1000.0');
assertEq(minifyJson({ v: 0 }), '{"v":0.0}', 'Integer 0 → 0.0');
assertEq(minifyJson({ v: 1.1 }), '{"v":1.1}', 'Decimal 1.1 → 1.1');
assertEq(minifyJson({ v: 0.5 }), '{"v":0.5}', 'Decimal 0.5 → 0.5');
assertEq(minifyJson({ v: 99.99 }), '{"v":99.99}', 'Decimal 99.99 → 99.99');

// Verify that the main minified document has LHDN decimal formatting
assert(minified.includes('1000.0'), 'Minified doc contains 1000.0 (not 1000)');

// ============================================================
// Test 2: Document Hash (Step 3)
// ============================================================
console.log('\n=== Test 2: SHA-256 Document Digest (Step 3) ===\n');

const minifiedBytes = Buffer.from(minified, 'utf-8');
const docDigest = createHash('sha256').update(minifiedBytes).digest('base64');
assert(docDigest.length > 0, `DocDigest computed: ${docDigest.substring(0, 20)}...`);

// Verify same input gives same hash
const docDigest2 = createHash('sha256').update(Buffer.from(minified, 'utf-8')).digest('base64');
assertEq(docDigest, docDigest2, 'DocDigest is deterministic');

// ============================================================
// Test 3: RSA-SHA256 Signing (Step 4)
// ============================================================
console.log('\n=== Test 3: RSA-SHA256 Signing (Step 4) ===\n');

const signer = createSign('RSA-SHA256');
signer.update(minifiedBytes);
const signatureValue = signer.sign(privateKeyPem, 'base64');
assert(signatureValue.length > 0, `SignatureValue computed (${signatureValue.length} chars)`);

// Verify signature
const verifier = createVerify('RSA-SHA256');
verifier.update(minifiedBytes);
const sigValid = verifier.verify(certificatePem, Buffer.from(signatureValue, 'base64'));
assert(sigValid, 'RSA-SHA256 signature verified with certificate');

// ============================================================
// Test 4: Certificate Digest (Step 5)
// ============================================================
console.log('\n=== Test 4: Certificate Digest (Step 5) ===\n');

const certDigest = createHash('sha256').update(rawDer).digest('base64');
assert(certDigest.length > 0, `CertDigest computed: ${certDigest.substring(0, 20)}...`);

// ============================================================
// Test 5: Signed Properties Hash (Step 6-7)
// ============================================================
console.log('\n=== Test 5: Signed Properties Digest (Steps 6-7) ===\n');

const signingTime = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
assert(signingTime.endsWith('Z'), `SigningTime format: ${signingTime}`);
assert(!signingTime.includes('.'), 'No milliseconds in signing time');

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
                      DigestMethod: [{ _: '', Algorithm: 'http://www.w3.org/2001/04/xmlenc#sha256' }],
                      DigestValue: [{ _: certDigest }],
                    },
                  ],
                  IssuerSerial: [
                    {
                      X509IssuerName: [{ _: issuerName }],
                      X509SerialNumber: [{ _: serialDecimal }],
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
const propsDigest = createHash('sha256').update(Buffer.from(propsMinified, 'utf-8')).digest('base64');
assert(propsDigest.length > 0, `PropsDigest computed: ${propsDigest.substring(0, 20)}...`);

// ============================================================
// Test 6: Full signing workflow (Steps 1-8)
// ============================================================
console.log('\n=== Test 6: Full Sign Document (Steps 1-8) ===\n');

// Re-implement buildUBLExtensions (matching signature-block.ts)
function buildUBLExtensions(c) {
  return [
    {
      UBLExtension: [
        {
          ExtensionURI: [{ _: 'urn:oasis:names:specification:ubl:dsig:enveloped:xades' }],
          ExtensionContent: [
            {
              UBLDocumentSignatures: [
                {
                  SignatureInformation: [
                    {
                      ID: [{ _: 'urn:oasis:names:specification:ubl:signature:1' }],
                      ReferencedSignatureID: [{ _: 'urn:oasis:names:specification:ubl:signature:Invoice' }],
                      Signature: [
                        {
                          Id: 'signature',
                          Object: [
                            {
                              QualifyingProperties: [
                                {
                                  Target: 'signature',
                                  SignedProperties: [
                                    {
                                      Id: 'id-xades-signed-props',
                                      SignedSignatureProperties: [
                                        {
                                          SigningTime: [{ _: c.signingTime }],
                                          SigningCertificate: [
                                            {
                                              Cert: [
                                                {
                                                  CertDigest: [
                                                    {
                                                      DigestMethod: [{ _: '', Algorithm: 'http://www.w3.org/2001/04/xmlenc#sha256' }],
                                                      DigestValue: [{ _: c.certDigest }],
                                                    },
                                                  ],
                                                  IssuerSerial: [
                                                    {
                                                      X509IssuerName: [{ _: c.issuerName }],
                                                      X509SerialNumber: [{ _: c.serialNumber }],
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
                                },
                              ],
                            },
                          ],
                          KeyInfo: [
                            {
                              X509Data: [
                                {
                                  X509Certificate: [{ _: c.certBase64 }],
                                  X509SubjectName: [{ _: c.subjectName }],
                                  X509IssuerSerial: [
                                    {
                                      X509IssuerName: [{ _: c.issuerName }],
                                      X509SerialNumber: [{ _: c.serialNumber }],
                                    },
                                  ],
                                },
                              ],
                            },
                          ],
                          SignatureValue: [{ _: c.signatureValue }],
                          SignedInfo: [
                            {
                              SignatureMethod: [{ _: '', Algorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256' }],
                              Reference: [
                                {
                                  Id: 'id-doc-signed-data',
                                  URI: '',
                                  DigestMethod: [{ _: '', Algorithm: 'http://www.w3.org/2001/04/xmlenc#sha256' }],
                                  DigestValue: [{ _: c.docDigest }],
                                },
                                {
                                  Id: 'id-xades-signed-props',
                                  Type: 'http://uri.etsi.org/01903/v1.3.2#SignedProperties',
                                  URI: '#id-xades-signed-props',
                                  DigestMethod: [{ _: '', Algorithm: 'http://www.w3.org/2001/04/xmlenc#sha256' }],
                                  DigestValue: [{ _: c.propsDigest }],
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
            },
          ],
        },
      ],
    },
  ];
}

function buildSignatureReference() {
  return [
    {
      ID: [{ _: 'urn:oasis:names:specification:ubl:signature:Invoice' }],
      SignatureMethod: [{ _: 'urn:oasis:names:specification:ubl:dsig:enveloped:xades' }],
    },
  ];
}

const components = {
  signatureValue,
  certBase64,
  certDigest,
  docDigest,
  propsDigest,
  signingTime,
  issuerName,
  subjectName,
  serialNumber: serialDecimal,
};

const ublExtensions = buildUBLExtensions(components);
const signatureRef = buildSignatureReference();

// Embed into document
const finalDoc = JSON.parse(minified);
finalDoc.Invoice[0].UBLExtensions = ublExtensions;
finalDoc.Invoice[0].Signature = signatureRef;

const signedDocument = minifyJson(finalDoc);
assert(signedDocument.includes('SignatureValue'), 'Signed document contains SignatureValue');
assert(signedDocument.includes('X509Certificate'), 'Signed document contains X509Certificate');
assert(signedDocument.includes('DigestValue'), 'Signed document contains DigestValue');
assert(signedDocument.includes(docDigest), 'Signed document contains correct DocDigest');

const finalDocHash = createHash('sha256').update(Buffer.from(signedDocument, 'utf-8')).digest('base64');
assert(finalDocHash.length > 0, `Final document hash: ${finalDocHash.substring(0, 20)}...`);

console.log(`  Signed document size: ${Buffer.byteLength(signedDocument, 'utf-8')} bytes`);

// ============================================================
// Test 7: Validate signed document
// ============================================================
console.log('\n=== Test 7: Validate Signed Document ===\n');

// Re-implement validation (matching validate-document.ts)
function validateDocument(documentStr) {
  const checks = {
    documentHash: false,
    certificateValid: false,
    signatureIntegrity: false,
    signatureComplete: false,
  };

  let doc;
  try {
    doc = JSON.parse(documentStr);
  } catch {
    return { valid: false, checks, error: 'Document is not valid JSON' };
  }

  // Check 1: Signature completeness
  try {
    const inv = doc.Invoice[0];
    if (!inv.UBLExtensions || !inv.Signature) {
      return { valid: false, checks, error: 'Signature block missing' };
    }
    const ext = inv.UBLExtensions[0];
    const ublExt = ext.UBLExtension[0];
    const extContent = ublExt.ExtensionContent[0];
    const docSigs = extContent.UBLDocumentSignatures[0];
    const sigInfo = docSigs.SignatureInformation[0];
    const sig = sigInfo.Signature[0];
    if (!sig.SignatureValue || !sig.KeyInfo || !sig.SignedInfo || !sig.Object) {
      return { valid: false, checks, error: 'Signature block incomplete' };
    }
    const ki = sig.KeyInfo[0];
    const x509d = ki.X509Data[0];
    if (!x509d.X509Certificate) {
      return { valid: false, checks, error: 'X509Certificate missing' };
    }
    checks.signatureComplete = true;
  } catch {
    return { valid: false, checks, error: 'Signature structure invalid' };
  }

  // Extract signature data
  const inv = doc.Invoice[0];
  const ext = inv.UBLExtensions[0];
  const ublExt = ext.UBLExtension[0];
  const extContent = ublExt.ExtensionContent[0];
  const docSigs = extContent.UBLDocumentSignatures[0];
  const sigInfo = docSigs.SignatureInformation[0];
  const sig = sigInfo.Signature[0];

  const extractedSigValue = sig.SignatureValue[0]._;
  const ki = sig.KeyInfo[0];
  const x509d = ki.X509Data[0];
  const extractedCertB64 = x509d.X509Certificate[0]._;

  const signedInfo = sig.SignedInfo[0];
  const refs = signedInfo.Reference;
  // Find doc reference by Id (position-independent)
  const docRef = refs.find(r => r.Id === 'id-doc-signed-data') || refs.find(r => r.URI === '' && !r.Type);
  const extractedDocDigest = docRef.DigestValue[0]._;

  // Check 2: Document hash
  const cleanedForValidation = removeSignatureFields(doc);
  const minifiedForValidation = minifyJson(cleanedForValidation);
  const computedDocDigest = createHash('sha256')
    .update(Buffer.from(minifiedForValidation, 'utf-8'))
    .digest('base64');

  checks.documentHash = computedDocDigest === extractedDocDigest;

  if (!checks.documentHash) {
    return {
      valid: false,
      checks,
      error: `Document hash mismatch: computed=${computedDocDigest}, expected=${extractedDocDigest}`,
    };
  }

  // Check 3: Signature integrity
  try {
    const extractedCertPem =
      '-----BEGIN CERTIFICATE-----\n' +
      extractedCertB64.match(/.{1,64}/g).join('\n') +
      '\n-----END CERTIFICATE-----';

    const v = createVerify('RSA-SHA256');
    v.update(Buffer.from(minifiedForValidation, 'utf-8'));
    checks.signatureIntegrity = v.verify(extractedCertPem, Buffer.from(extractedSigValue, 'base64'));
  } catch {
    checks.signatureIntegrity = false;
  }

  if (!checks.signatureIntegrity) {
    return { valid: false, checks, error: 'RSA-SHA256 signature verification failed' };
  }

  // Check 4: Certificate validity
  try {
    const certDer = Buffer.from(extractedCertB64, 'base64');
    const cert = new X509Certificate(certDer);
    const now = new Date();
    checks.certificateValid = now >= new Date(cert.validFrom) && now <= new Date(cert.validTo);
  } catch {
    checks.certificateValid = false;
  }

  if (!checks.certificateValid) {
    return { valid: false, checks, error: 'Certificate is expired or not yet valid' };
  }

  return { valid: true, checks };
}

const result = validateDocument(signedDocument);
assert(result.valid, `Document validation: valid=${result.valid}`);
assert(result.checks.signatureComplete, 'Check: signatureComplete');
assert(result.checks.documentHash, 'Check: documentHash');
assert(result.checks.signatureIntegrity, 'Check: signatureIntegrity');
assert(result.checks.certificateValid, 'Check: certificateValid');

if (!result.valid) {
  console.error(`  Validation error: ${result.error}`);
}

// ============================================================
// Test 8: Tampered document detection
// ============================================================
console.log('\n=== Test 8: Tampered Document Detection ===\n');

const tamperedDoc = JSON.parse(signedDocument);
tamperedDoc.Invoice[0].LegalMonetaryTotal[0].PayableAmount[0]._ = 9999.99;
const tamperedStr = JSON.stringify(tamperedDoc);

const tamperedResult = validateDocument(tamperedStr);
assert(!tamperedResult.valid, 'Tampered document correctly rejected');
assert(tamperedResult.checks.signatureComplete, 'Tampered doc: signatureComplete still passes');
assert(!tamperedResult.checks.documentHash, 'Tampered doc: documentHash correctly fails');

// ============================================================
// Test 9: Edge cases
// ============================================================
console.log('\n=== Test 9: Edge Cases ===\n');

const invalidJsonResult = validateDocument('not valid json');
assert(!invalidJsonResult.valid, 'Invalid JSON correctly rejected');

const noInvoiceResult = validateDocument('{"data": "no invoice"}');
assert(!noInvoiceResult.valid, 'Missing Invoice correctly rejected');

const emptyInvoiceResult = validateDocument('{"Invoice": [{}]}');
assert(!emptyInvoiceResult.valid, 'Empty Invoice correctly rejected');

// ============================================================
// Test 10: Document size check
// ============================================================
console.log('\n=== Test 10: Document Size Validation ===\n');

const docSize = Buffer.byteLength(signedDocument, 'utf-8');
assert(docSize < 300 * 1024, `Signed document size ${docSize} bytes < 300 KB LHDN limit`);

// ============================================================
// Test 11: Round-trip sign + validate with integer amounts
// ============================================================
console.log('\n=== Test 11: Round-trip Integer Amount Handling ===\n');

// Simulate an invoice where amounts are plain integers (no .0 in source)
const integerInvoice = {
  Invoice: [
    {
      ID: [{ _: 'INT-001' }],
      IssueDate: [{ _: '2026-02-20' }],
      InvoiceTypeCode: [{ _: '01', listVersionID: '1.1' }],
      DocumentCurrencyCode: [{ _: 'MYR' }],
      AccountingSupplierParty: [{ Party: [{ PartyIdentification: [{ ID: [{ _: 'C12345678', schemeID: 'TIN' }] }] }] }],
      AccountingCustomerParty: [{ Party: [{ PartyIdentification: [{ ID: [{ _: 'C87654321', schemeID: 'TIN' }] }] }] }],
      LegalMonetaryTotal: [
        {
          PayableAmount: [{ _: 500, currencyID: 'MYR' }],
          TaxExclusiveAmount: [{ _: 500, currencyID: 'MYR' }],
        },
      ],
    },
  ],
};

// Sign the integer invoice
const intDoc = ensureNamespacePrefixes(integerInvoice);
const intCleaned = removeSignatureFields(intDoc);
const intMinified = minifyJson(intCleaned);

// Verify integers got decimal formatting in minified output
assert(intMinified.includes('500.0'), 'Integer 500 formatted as 500.0 in minified output');

const intMinifiedBytes = Buffer.from(intMinified, 'utf-8');
const intDocDigest = createHash('sha256').update(intMinifiedBytes).digest('base64');

const intSigner = createSign('RSA-SHA256');
intSigner.update(intMinifiedBytes);
const intSignatureValue = intSigner.sign(privateKeyPem, 'base64');

const intSigningTime = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
const intCertDigest = certDigest;
const intPropsForHash = {
  Target: 'signature',
  SignedProperties: [{
    Id: 'id-xades-signed-props',
    SignedSignatureProperties: [{
      SigningTime: [{ _: intSigningTime }],
      SigningCertificate: [{
        Cert: [{
          CertDigest: [{
            DigestMethod: [{ _: '', Algorithm: 'http://www.w3.org/2001/04/xmlenc#sha256' }],
            DigestValue: [{ _: intCertDigest }],
          }],
          IssuerSerial: [{
            X509IssuerName: [{ _: issuerName }],
            X509SerialNumber: [{ _: serialDecimal }],
          }],
        }],
      }],
    }],
  }],
};
const intPropsDigest = createHash('sha256')
  .update(Buffer.from(JSON.stringify(intPropsForHash), 'utf-8'))
  .digest('base64');

const intComponents = {
  signatureValue: intSignatureValue,
  certBase64,
  certDigest: intCertDigest,
  docDigest: intDocDigest,
  propsDigest: intPropsDigest,
  signingTime: intSigningTime,
  issuerName,
  subjectName,
  serialNumber: serialDecimal,
};

const intFinalDoc = JSON.parse(intMinified);
intFinalDoc.Invoice[0].UBLExtensions = buildUBLExtensions(intComponents);
intFinalDoc.Invoice[0].Signature = buildSignatureReference();
const intSignedDocument = minifyJson(intFinalDoc);

// Validate: parse → minify → hash must match (integers normalized to .0 both times)
const intResult = validateDocument(intSignedDocument);
assert(intResult.valid, 'Round-trip: integer invoice signed and validated successfully');
assert(intResult.checks.documentHash, 'Round-trip: document hash matches after integer normalization');
assert(intResult.checks.signatureIntegrity, 'Round-trip: signature integrity preserved');

// ============================================================
// Summary
// ============================================================
console.log('\n===================================================');
console.log(`  UAT Results: ${passed} passed, ${failed} failed`);
console.log('===================================================\n');

// Cleanup
rmSync(tmpDir, { recursive: true, force: true });

process.exit(failed > 0 ? 1 : 0);
