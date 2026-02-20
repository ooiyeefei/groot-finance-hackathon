export const MALAYSIAN_STATE_CODES = [
  { code: "JHR", name: "Johor" },
  { code: "KDH", name: "Kedah" },
  { code: "KTN", name: "Kelantan" },
  { code: "MLK", name: "Melaka" },
  { code: "NSN", name: "Negeri Sembilan" },
  { code: "PHG", name: "Pahang" },
  { code: "PRK", name: "Perak" },
  { code: "PLS", name: "Perlis" },
  { code: "PNG", name: "Pulau Pinang" },
  { code: "SBH", name: "Sabah" },
  { code: "SWK", name: "Sarawak" },
  { code: "SGR", name: "Selangor" },
  { code: "TRG", name: "Terengganu" },
  { code: "WPK", name: "W.P. Kuala Lumpur" },
  { code: "WPP", name: "W.P. Putrajaya" },
  { code: "WPL", name: "W.P. Labuan" },
] as const

export type MalaysianStateCode = (typeof MALAYSIAN_STATE_CODES)[number]["code"]
