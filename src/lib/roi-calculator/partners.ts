/**
 * Partner code → display info lookup.
 *
 * To add a new partner: add an entry below and redeploy.
 * If the partner list grows beyond ~50 entries, consider
 * migrating to a Convex table.
 */

export interface PartnerInfo {
  name: string
  contactUrl: string
}

const PARTNERS: Record<string, PartnerInfo> = {
  // Example partners — replace with real partner data
  acme: {
    name: 'Acme Consulting',
    contactUrl: 'mailto:hello@acme-consulting.com',
  },
  techpartner: {
    name: 'TechPartner Solutions',
    contactUrl: 'mailto:partnerships@techpartner.com',
  },
}

/**
 * Look up partner info by code. Returns null for unknown codes.
 */
export function getPartner(code: string | null): PartnerInfo | null {
  if (!code) return null
  return PARTNERS[code.toLowerCase()] ?? null
}
