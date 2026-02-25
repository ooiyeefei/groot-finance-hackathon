// Registration number validation for country-based pricing lockdown
// UEN (Singapore) and SSM/ROC (Malaysia) format validation

const UEN_REGEX = /^([0-9]{8,9}[A-Z]|[STURF][0-9]{2}[A-Z]{2}[0-9]{4}[A-Z])$/;
const SSM_REGEX = /^([0-9]{7}-[A-Z]|[0-9]{12}|[A-Z]{2}[0-9]{7}-[A-Z])$/;

export function isValidRegNumber(value: string, country: 'SG' | 'MY'): boolean {
  const normalized = normalizeRegNumber(value);
  if (!normalized) return false;

  switch (country) {
    case 'SG':
      return UEN_REGEX.test(normalized);
    case 'MY':
      return SSM_REGEX.test(normalized);
    default:
      return false;
  }
}

export function normalizeRegNumber(value: string): string {
  return value.trim().toUpperCase();
}

export function getRegNumberFormatHint(country: 'SG' | 'MY'): string {
  switch (country) {
    case 'SG':
      return 'Singapore UEN format: 200012345X or T20SS0001A';
    case 'MY':
      return 'Malaysia SSM format: 1234567-H, 202301234567, or SA0012345-A';
    default:
      return '';
  }
}
