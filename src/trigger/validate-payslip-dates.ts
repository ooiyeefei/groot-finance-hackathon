/**
 * Payslip Date Validation Task
 * Intelligent validation of payslip dates to ensure "most recent 3 months" requirement is met
 */

import { task } from "@trigger.dev/sdk/v3";
import { python } from "@trigger.dev/python";
import { supabase } from './utils/db-helpers';

interface ValidatePayslipDatesPayload {
  applicationId: string;
}

interface PayslipValidationResult {
  status: 'valid' | 'invalid';
  count: number;
  reason?: string;
  details: {
    slot: string;
    fileName: string;
    payPeriod: string | null;
    monthYear: string | null;
    isValid: boolean;
    validationMessage: string;
  }[];
}

export const validatePayslipDates = task({
  id: "validate-payslip-dates",
  run: async (payload: ValidatePayslipDatesPayload, { ctx }) => {
    const { applicationId } = payload;

    console.log(`[ValidatePayslip] Starting payslip date validation for application ${applicationId}`);

    try {
      // Fetch all payslip documents associated with the application
      // Support both individual payslip documents and payslip_group documents
      const { data: documents, error: fetchError } = await supabase
        .from('documents')
        .select('*')
        .eq('application_id', applicationId)
        .in('document_type', ['payslip', 'payslip_group', 'multi_payslip'])
        .eq('processing_status', 'completed');

      if (fetchError) {
        throw new Error(`Failed to fetch payslip documents: ${fetchError.message}`);
      }

      console.log(`[ValidatePayslip] Found ${documents?.length || 0} completed payslip documents`);

      if (!documents || documents.length === 0) {
        const result: PayslipValidationResult = {
          status: 'invalid',
          count: 0,
          reason: getUserFriendlyReason('no_payslips_uploaded'),
          details: []
        };

        await updateApplicationValidationResults(applicationId, { payslips: result });
        return { success: true, validation: result };
      }

      // Enhanced validation supporting both individual payslips and multi-payslip lists
      console.log(`[ValidatePayslip] Processing documents with list support for multi-payslip extraction`);

      const validationDetails: PayslipValidationResult['details'] = [];
      const validMonths = new Set<string>();

      // Get current date and calculate the last 3 months for validation window
      // For strict 3-month validation, we want the most recent 3 complete months
      const currentDate = new Date();
      const validationDate = new Date();
      validationDate.setMonth(currentDate.getMonth() - 2); // Only last 2 months + current month

      console.log(`[ValidatePayslip] Current date: ${currentDate.toISOString()}, Validation cutoff: ${validationDate.toISOString()}`);

      // Extract all individual payslips from documents (supporting list processing)
      const allPayslips: Array<{
        payPeriod: string | null;
        documentSlot: string;
        fileName: string;
        source: 'individual' | 'multi_payslip_list';
        payslipIndex?: number;
      }> = [];

      for (const doc of documents) {
        // Handle documents with multiple payslips (extracted_data contains payslips array)
        if (doc.extracted_data?.payslips && Array.isArray(doc.extracted_data.payslips)) {
          console.log(`[ValidatePayslip] Processing multi-payslip document: ${doc.file_name} with ${doc.extracted_data.payslips.length} payslips`);

          doc.extracted_data.payslips.forEach((payslip: any, index: number) => {
            allPayslips.push({
              payPeriod: payslip.pay_period || null,
              documentSlot: doc.document_slot || `multi_payslip_${index}`,
              fileName: `${doc.file_name} (Payslip ${index + 1})`,
              source: 'multi_payslip_list',
              payslipIndex: index
            });
          });
        }
        // Handle individual payslip documents (single payslip data in extracted_data)
        else if (doc.extracted_data?.pay_period) {
          console.log(`[ValidatePayslip] Processing individual payslip: ${doc.file_name}`);

          allPayslips.push({
            payPeriod: doc.extracted_data.pay_period,
            documentSlot: doc.document_slot || 'unknown',
            fileName: doc.file_name,
            source: 'individual'
          });
        }
        // Handle legacy cases where extracted_data structure might be different
        else if (doc.extracted_data && typeof doc.extracted_data === 'object') {
          console.log(`[ValidatePayslip] Processing legacy document structure: ${doc.file_name}`);
          console.log(`[ValidatePayslip] Extracted data keys: ${Object.keys(doc.extracted_data).join(', ')}`);

          // Try to find pay_period in different possible structures
          const payPeriod = doc.extracted_data.pay_period ||
                           doc.extracted_data.payPeriod ||
                           doc.extracted_data.pay_date ||
                           null;

          if (payPeriod) {
            allPayslips.push({
              payPeriod: payPeriod,
              documentSlot: doc.document_slot || 'legacy',
              fileName: doc.file_name,
              source: 'individual'
            });
          }
        }
      }

      console.log(`[ValidatePayslip] Extracted ${allPayslips.length} payslips for validation from ${documents.length} documents`);

      // Process each payslip in the consolidated list
      for (const payslip of allPayslips) {

        let isValid = false;
        let validationMessage = '';
        let monthYear: string | null = null;

        if (!payslip.payPeriod) {
          validationMessage = 'Pay period not found in extracted data';
        } else {
          // Parse standardized MMM-YYYY format (e.g., 'APR-2025')
          const standardizedMatch = parseStandardizedPayPeriod(payslip.payPeriod);

          if (!standardizedMatch) {
            validationMessage = `Invalid pay period format: ${payslip.payPeriod}. Expected MMM-YYYY (e.g., APR-2025)`;
          } else {
            monthYear = standardizedMatch;

            // Check for duplicate months
            if (validMonths.has(monthYear)) {
              validationMessage = `Duplicate month: ${monthYear}`;
            } else {
              // Validate date range - strict 3-month window
              const payslipDate = parseStandardizedMonthYear(monthYear);
              if (!payslipDate) {
                validationMessage = `Failed to parse month/year: ${monthYear}`;
              } else if (payslipDate < validationDate) {
                validationMessage = `Outside 3-month range: ${monthYear}`;
                console.log(`[ValidatePayslip] ${monthYear} is before ${validationDate.toISOString()} - flagged as too old`);
              } else if (payslipDate > currentDate) {
                validationMessage = `Future date not allowed: ${monthYear}`;
                console.log(`[ValidatePayslip] ${monthYear} is after ${currentDate.toISOString()} - flagged as future`);
              } else {
                isValid = true;
                validationMessage = `Verified: ${monthYear}`;
                validMonths.add(monthYear);
                console.log(`[ValidatePayslip] ${monthYear} is valid - within 3-month window`);
              }
            }
          }
        }

        // Apply user-friendly messaging
        const friendlyMessage = getUserFriendlyMessage(validationMessage, monthYear);

        validationDetails.push({
          slot: payslip.documentSlot,
          fileName: payslip.fileName,
          payPeriod: payslip.payPeriod || null,
          monthYear: monthYear,
          isValid: isValid,
          validationMessage: friendlyMessage
        });

        console.log(`[ValidatePayslip] ${payslip.fileName} (${payslip.documentSlot}): ${validationMessage}`);
      }

      // Determine overall validation status with flexible requirements
      const validPayslips = validationDetails.filter(detail => detail.isValid);
      const minRequiredCount = 3; // Minimum 3 months required
      const maxAllowedCount = 6;  // Maximum to prevent excessive uploads

      let overallStatus: 'valid' | 'invalid' = 'invalid';
      let overallReason: string | undefined;

      console.log(`[ValidatePayslip] Validation summary: ${validPayslips.length} valid out of ${validationDetails.length} total payslips`);

      if (validPayslips.length === 0) {
        overallReason = 'no_valid_payslips_found';
      } else if (validPayslips.length < minRequiredCount) {
        overallReason = `need_${minRequiredCount - validPayslips.length}_more_payslips`;
      } else if (validPayslips.length > maxAllowedCount) {
        overallReason = 'too_many_payslips_uploaded';
      } else {
        // Check if we have at least 3 consecutive recent months using standardized format
        const validMonthsSorted = Array.from(validMonths).sort().reverse(); // Most recent first
        console.log(`[ValidatePayslip] Valid months found: ${validMonthsSorted.join(', ')}`);

        if (validMonthsSorted.length >= minRequiredCount && areConsecutiveRecentMonths(validMonthsSorted.slice(0, minRequiredCount), validationDate)) {
          overallStatus = 'valid';
          console.log(`[ValidatePayslip] SUCCESS: Found ${minRequiredCount} consecutive recent months`);
        } else {
          overallReason = `months_not_consecutive_or_recent`;
          console.log(`[ValidatePayslip] FAIL: Months not consecutive or not recent enough`);
        }
      }

      // Create result with user-friendly reason
      const friendlyReason = overallReason ? getUserFriendlyReason(overallReason) : undefined;

      const result: PayslipValidationResult = {
        status: overallStatus,
        count: validPayslips.length,
        reason: friendlyReason,
        details: validationDetails
      };

      console.log(`[ValidatePayslip] Enhanced list validation result: ${result.status} (${validPayslips.length}/${minRequiredCount}+ valid, reason: ${result.reason || 'success'})`);

      // Update application with validation results
      await updateApplicationValidationResults(applicationId, { payslips: result });

      return {
        success: true,
        validation: result,
        taskId: ctx.run.id
      };

    } catch (error) {
      console.error(`[ValidatePayslip] Validation failed for application ${applicationId}:`, error);

      const errorResult: PayslipValidationResult = {
        status: 'invalid',
        count: 0,
        reason: getUserFriendlyReason('validation_error'),
        details: []
      };

      await updateApplicationValidationResults(applicationId, { payslips: errorResult });
      throw error;
    }
  }
});

/**
 * Parse standardized MMM-YYYY format from DSPy extraction
 */
function parseStandardizedPayPeriod(payPeriod: string): string | null {
  // Expected format: MMM-YYYY (e.g., 'APR-2025', 'JUN-2024')
  const standardizedMatch = payPeriod.match(/^([A-Z]{3})-(\d{4})$/i);
  if (standardizedMatch) {
    const [, monthAbbr, year] = standardizedMatch;
    return `${monthAbbr.toUpperCase()}-${year}`;
  }
  return null;
}

/**
 * Convert standardized MMM-YYYY to Date object (first day of the month)
 */
function parseStandardizedMonthYear(monthYear: string): Date | null {
  const match = monthYear.match(/^([A-Z]{3})-(\d{4})$/);
  if (!match) return null;

  const [, monthAbbr, year] = match;
  const monthNumber = getStandardizedMonthNumber(monthAbbr);
  if (!monthNumber) return null;

  return new Date(parseInt(year), monthNumber - 1, 1); // Month is 0-indexed in Date constructor
}

/**
 * Convert 3-letter month abbreviation to number
 */
function getStandardizedMonthNumber(monthAbbr: string): number | null {
  const months: { [key: string]: number } = {
    'JAN': 1, 'FEB': 2, 'MAR': 3, 'APR': 4,
    'MAY': 5, 'JUN': 6, 'JUL': 7, 'AUG': 8,
    'SEP': 9, 'OCT': 10, 'NOV': 11, 'DEC': 12
  };
  return months[monthAbbr.toUpperCase()] || null;
}

/**
 * Check if the valid months represent 3 consecutive recent months (standardized format)
 */
function areConsecutiveRecentMonths(sortedMonths: string[], validationDate: Date): boolean {
  if (sortedMonths.length !== 3) return false;

  // Parse months into Date objects
  const monthDates = sortedMonths.map(parseStandardizedMonthYear).filter(Boolean) as Date[];
  if (monthDates.length !== 3) return false;

  // Sort by date (most recent first)
  monthDates.sort((a, b) => b.getTime() - a.getTime());

  // Check if they are consecutive months
  for (let i = 0; i < monthDates.length - 1; i++) {
    const current = monthDates[i];
    const next = monthDates[i + 1];

    // Calculate expected previous month
    const expectedPrevious = new Date(current);
    expectedPrevious.setMonth(expectedPrevious.getMonth() - 1);

    if (expectedPrevious.getFullYear() !== next.getFullYear() ||
        expectedPrevious.getMonth() !== next.getMonth()) {
      return false;
    }
  }

  // Check if the most recent month is within the validation window
  return monthDates[0] >= validationDate;
}

/**
 * Convert technical validation reasons to user-friendly messages
 */
function getUserFriendlyReason(reason: string): string {
  switch (reason) {
    case 'no_valid_payslips_found':
      return 'No valid payslips found - please check the uploaded documents'
    case 'need_1_more_payslips':
      return 'Upload 1 more valid payslip to meet the 3-month requirement'
    case 'need_2_more_payslips':
      return 'Upload 2 more valid payslips to meet the 3-month requirement'
    case 'need_3_more_payslips':
      return 'Upload 3 valid payslips to meet the minimum requirement'
    case 'too_many_payslips_uploaded':
      return 'Too many payslips uploaded - maximum 6 allowed'
    case 'months_not_consecutive_or_recent':
      return 'Payslips must be for 3 consecutive recent months'
    case 'validation_error':
      return 'Validation failed due to a system error - please try again'
    case 'no_payslips_uploaded':
      return 'No payslips have been uploaded yet'
    default:
      if (reason.startsWith('insufficient_payslips_')) {
        const parts = reason.split('_')
        const current = parts[2]
        const required = parts[4]
        return `Only ${current} of ${required} required payslips are valid`
      }
      return reason.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())
  }
}

/**
 * Convert technical validation messages to user-friendly messages
 */
function getUserFriendlyMessage(message: string, monthYear?: string | null): string {
  switch (true) {
    case message === 'Pay period not found in extracted data':
      return 'Could not read the pay period from this payslip'
    case message.startsWith('Invalid pay period format'):
      return `Pay period format unclear - found "${monthYear}" but expected format like "APR-2025"`
    case message.startsWith('Duplicate month'):
      return `This month (${monthYear}) is already covered by another payslip`
    case message.startsWith('Failed to parse month/year'):
      return `Could not understand the date format in this payslip`
    case message.startsWith('Outside 3-month range'):
      return `${monthYear} is too old - payslips must be from the last 3 months`
    case message.startsWith('Future date not allowed'):
      return `${monthYear} is in the future - please check the payslip date`
    case message.startsWith('Verified'):
      return `✓ Valid payslip for ${monthYear}`
    default:
      return message
  }
}

/**
 * Update application validation results in database
 */
async function updateApplicationValidationResults(
  applicationId: string,
  validationResults: { payslips: PayslipValidationResult }
) {
  try {
    const { error } = await supabase
      .from('applications')
      .update({
        validation_results: validationResults,
        updated_at: new Date().toISOString()
      })
      .eq('id', applicationId);

    if (error) {
      throw new Error(`Failed to update validation results: ${error.message}`);
    }

    console.log(`[ValidatePayslip] Updated application ${applicationId} with validation results`);
  } catch (error) {
    console.error(`[ValidatePayslip] Failed to update validation results:`, error);
    throw error;
  }
}