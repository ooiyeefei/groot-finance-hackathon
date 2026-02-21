import type { SignatureComponents } from '../types';

/**
 * Build the complete UBLExtensions and Signature JSON structures
 * per LHDN UBL 2.1 JSON "_" convention (XAdES-equivalent).
 */

export function buildUBLExtensions(components: SignatureComponents): unknown[] {
  return [
    {
      UBLExtension: [
        {
          ExtensionURI: [
            {
              _: 'urn:oasis:names:specification:ubl:dsig:enveloped:xades',
            },
          ],
          ExtensionContent: [
            {
              UBLDocumentSignatures: [
                {
                  SignatureInformation: [
                    {
                      ID: [
                        {
                          _: 'urn:oasis:names:specification:ubl:signature:1',
                        },
                      ],
                      ReferencedSignatureID: [
                        {
                          _: 'urn:oasis:names:specification:ubl:signature:Invoice',
                        },
                      ],
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
                                          SigningTime: [
                                            { _: components.signingTime },
                                          ],
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
                                                      DigestValue: [
                                                        {
                                                          _: components.certDigest,
                                                        },
                                                      ],
                                                    },
                                                  ],
                                                  IssuerSerial: [
                                                    {
                                                      X509IssuerName: [
                                                        {
                                                          _: components.issuerName,
                                                        },
                                                      ],
                                                      X509SerialNumber: [
                                                        {
                                                          _: components.serialNumber,
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
                          ],
                          KeyInfo: [
                            {
                              X509Data: [
                                {
                                  X509Certificate: [
                                    { _: components.certBase64 },
                                  ],
                                  X509SubjectName: [
                                    { _: components.subjectName },
                                  ],
                                  X509IssuerSerial: [
                                    {
                                      X509IssuerName: [
                                        { _: components.issuerName },
                                      ],
                                      X509SerialNumber: [
                                        { _: components.serialNumber },
                                      ],
                                    },
                                  ],
                                },
                              ],
                            },
                          ],
                          SignatureValue: [
                            { _: components.signatureValue },
                          ],
                          SignedInfo: [
                            {
                              SignatureMethod: [
                                {
                                  _: '',
                                  Algorithm:
                                    'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
                                },
                              ],
                              Reference: [
                                {
                                  Id: 'id-doc-signed-data',
                                  URI: '',
                                  DigestMethod: [
                                    {
                                      _: '',
                                      Algorithm:
                                        'http://www.w3.org/2001/04/xmlenc#sha256',
                                    },
                                  ],
                                  DigestValue: [
                                    { _: components.docDigest },
                                  ],
                                },
                                {
                                  Id: 'id-xades-signed-props',
                                  Type: 'http://uri.etsi.org/01903/v1.3.2#SignedProperties',
                                  URI: '#id-xades-signed-props',
                                  DigestMethod: [
                                    {
                                      _: '',
                                      Algorithm:
                                        'http://www.w3.org/2001/04/xmlenc#sha256',
                                    },
                                  ],
                                  DigestValue: [
                                    { _: components.propsDigest },
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
      ],
    },
  ];
}

export function buildSignatureReference(): unknown[] {
  return [
    {
      ID: [
        { _: 'urn:oasis:names:specification:ubl:signature:Invoice' },
      ],
      SignatureMethod: [
        {
          _: 'urn:oasis:names:specification:ubl:dsig:enveloped:xades',
        },
      ],
    },
  ];
}
