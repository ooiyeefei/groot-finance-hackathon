import QRCode from 'qrcode'

const PUBLIC_BASE_URL = 'https://finance.hellogroot.com'

/**
 * Generate a QR code data URL for the debtor self-service update form.
 * Used in invoice PDF generation.
 */
export async function generateDebtorUpdateQrDataUrl(
  token: string,
  locale: string = 'en'
): Promise<string> {
  const url = `${PUBLIC_BASE_URL}/${locale}/debtor-update/${token}`
  return QRCode.toDataURL(url, {
    width: 100,
    margin: 1,
    color: {
      dark: '#000000',
      light: '#ffffff',
    },
  })
}
