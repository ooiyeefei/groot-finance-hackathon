export interface AddressFields {
  addressLine1?: string
  addressLine2?: string
  addressLine3?: string
  city?: string
  stateCode?: string
  postalCode?: string
  countryCode?: string
}

/**
 * Returns true if any structured address field is present (non-empty).
 */
export function hasStructuredAddress(addr: AddressFields | null | undefined): boolean {
  if (!addr) return false
  return !!(
    addr.addressLine1 ||
    addr.addressLine2 ||
    addr.addressLine3 ||
    addr.city ||
    addr.stateCode ||
    addr.postalCode ||
    addr.countryCode
  )
}

/**
 * Formats structured address fields into a display string.
 *
 * - 'multiline': Each component on its own line (for invoice display, detail views)
 * - 'singleline': Comma-separated (for lists, compact display)
 *
 * Returns empty string if no structured fields are present.
 */
export function formatAddress(
  addr: AddressFields | null | undefined,
  mode: "multiline" | "singleline" = "multiline"
): string {
  if (!addr || !hasStructuredAddress(addr)) return ""

  if (mode === "singleline") {
    const parts: string[] = []
    if (addr.addressLine1) parts.push(addr.addressLine1)
    if (addr.addressLine2) parts.push(addr.addressLine2)
    if (addr.addressLine3) parts.push(addr.addressLine3)

    const cityPostal = [addr.postalCode, addr.city].filter(Boolean).join(" ")
    if (cityPostal) parts.push(cityPostal)

    if (addr.stateCode) parts.push(addr.stateCode)
    if (addr.countryCode) parts.push(addr.countryCode)

    return parts.join(", ")
  }

  // multiline
  const lines: string[] = []
  if (addr.addressLine1) lines.push(addr.addressLine1)
  if (addr.addressLine2) lines.push(addr.addressLine2)
  if (addr.addressLine3) lines.push(addr.addressLine3)

  const cityPostal = [addr.postalCode, addr.city].filter(Boolean).join(" ")
  if (cityPostal) lines.push(cityPostal)

  if (addr.stateCode) lines.push(addr.stateCode)
  if (addr.countryCode) lines.push(addr.countryCode)

  return lines.join("\n")
}
