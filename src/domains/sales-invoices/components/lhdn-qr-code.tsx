'use client'

import { useState, useEffect } from 'react'
import QRCode from 'qrcode'

interface LhdnQrCodeProps {
  lhdnLongId: string | undefined
}

const LHDN_VERIFICATION_BASE_URL = 'https://myinvois.hasil.gov.my'

/**
 * Generate a QR code data URL for the LHDN verification link.
 * Exported for use in PDF generation.
 */
export async function generateLhdnQrDataUrl(lhdnLongId: string): Promise<string> {
  const url = `${LHDN_VERIFICATION_BASE_URL}/${lhdnLongId}/share`
  return QRCode.toDataURL(url, {
    width: 120,
    margin: 1,
    color: {
      dark: '#000000',
      light: '#ffffff',
    },
  })
}

export function LhdnQrCode({ lhdnLongId }: LhdnQrCodeProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!lhdnLongId) return

    generateLhdnQrDataUrl(lhdnLongId)
      .then(setQrDataUrl)
      .catch((err) => {
        console.error('Failed to generate LHDN QR code:', err)
      })
  }, [lhdnLongId])

  if (!lhdnLongId || !qrDataUrl) return null

  const verificationUrl = `${LHDN_VERIFICATION_BASE_URL}/${lhdnLongId}/share`

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground">
        LHDN e-Invoice Verification
      </p>
      <div className="flex items-start gap-3">
        <img
          src={qrDataUrl}
          alt="LHDN e-Invoice verification QR code"
          width={120}
          height={120}
          className="rounded border border-border"
        />
        <p className="text-xs text-muted-foreground break-all pt-1">
          {verificationUrl}
        </p>
      </div>
    </div>
  )
}
