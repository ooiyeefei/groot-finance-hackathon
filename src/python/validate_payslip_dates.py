#!/usr/bin/env python3
"""
AI-Powered Payslip Date Validation
Uses Gemini with function calling to intelligently parse and validate payslip dates
"""

import sys
import json
import os
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
import dspy
from pydantic import BaseModel, Field

class PayslipDateInfo(BaseModel):
    """Structured information about a payslip date"""
    original_text: str = Field(..., description="The original pay period text from the payslip")
    month: int = Field(..., ge=1, le=12, description="The month number (1-12)")
    year: int = Field(..., ge=2020, le=2030, description="The year (4 digits)")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Confidence in the date parsing (0.0 to 1.0)")
    reasoning: str = Field(..., description="Explanation of how the date was interpreted")

class PayslipValidationResult(BaseModel):
    """Result of payslip date validation"""
    is_valid: bool = Field(..., description="Whether the payslip date is valid for loan application")
    month_year: str = Field(..., description="Standardized month-year format (YYYY-MM)")
    validation_message: str = Field(..., description="Human-readable validation message")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Confidence in the validation result")

class DateValidationSignature(dspy.Signature):
    """Parse and validate payslip dates using current date context and requirements"""

    current_date: str = dspy.InputField(desc="Today's date in ISO format (YYYY-MM-DD)")
    pay_period_text: str = dspy.InputField(desc="The pay period text extracted from the payslip")
    validation_requirements: str = dspy.InputField(desc="Requirements for valid payslips (e.g., must be within last 3 months)")

    date_info: PayslipDateInfo = dspy.OutputField(desc="Parsed date information from the pay period text")
    validation_result: PayslipValidationResult = dspy.OutputField(desc="Validation result based on requirements")

class PayslipDateValidator:
    """AI-powered payslip date validator using Gemini function calling"""

    def __init__(self):
        """Initialize the validator with Gemini model"""
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY environment variable required")

        # Configure Gemini model with function calling support
        self.model = dspy.LM(
            model="gemini/gemini-2.5-flash",
            api_key=api_key,
            temperature=0.1,  # Low temperature for consistent parsing
            max_tokens=4096
        )
        # ✅ Enable usage tracking for cost monitoring
        dspy.settings.configure(lm=self.model, track_usage=True)

        # Create the validator using ChainOfThought for better reasoning
        self.validator = dspy.ChainOfThought(DateValidationSignature)

    def validate_payslip_dates(self, payslips_data: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Validate multiple payslip dates using AI

        Args:
            payslips_data: List of payslip data containing pay_period and other info

        Returns:
            Validation results in the expected format
        """
        try:
            print(f"[ValidateAI] Starting AI-powered validation for {len(payslips_data)} payslips", file=sys.stderr)

            # Get current date and calculate requirements
            current_date = datetime.now()
            current_date_str = current_date.strftime("%Y-%m-%d")
            three_months_ago = current_date - timedelta(days=90)

            validation_requirements = f"""
Requirements for valid payslips:
1. Must be from the last 3 months (from {three_months_ago.strftime('%Y-%m-%d')} to {current_date_str})
2. Each payslip should represent a different month
3. Should be consecutive recent months ideally
4. Future dates are not allowed
5. The date should represent the pay period/month, not individual pay dates
"""

            validation_details = []
            valid_months = set()

            for payslip in payslips_data:
                pay_period = payslip.get('pay_period', '')
                file_name = payslip.get('file_name', 'unknown')
                document_slot = payslip.get('document_slot', 'unknown')

                if not pay_period:
                    validation_details.append({
                        'slot': document_slot,
                        'fileName': file_name,
                        'payPeriod': None,
                        'monthYear': None,
                        'isValid': False,
                        'validationMessage': 'No pay period found in extracted data'
                    })
                    continue

                print(f"[ValidateAI] Processing {file_name}: '{pay_period}'", file=sys.stderr)

                # Use AI to parse and validate the date
                try:
                    prediction = self.validator(
                        current_date=current_date_str,
                        pay_period_text=pay_period,
                        validation_requirements=validation_requirements
                    )

                    date_info = prediction.date_info
                    validation_result = prediction.validation_result

                    print(f"[ValidateAI] AI parsed: {date_info.month}/{date_info.year} (confidence: {date_info.confidence})", file=sys.stderr)
                    print(f"[ValidateAI] Validation: {validation_result.validation_message}", file=sys.stderr)

                    # Check for duplicate months
                    month_year = validation_result.month_year
                    if validation_result.is_valid and month_year in valid_months:
                        validation_result.is_valid = False
                        validation_result.validation_message = f"Duplicate month: {month_year}"
                    elif validation_result.is_valid:
                        valid_months.add(month_year)

                    validation_details.append({
                        'slot': document_slot,
                        'fileName': file_name,
                        'payPeriod': pay_period,
                        'monthYear': month_year,
                        'isValid': validation_result.is_valid,
                        'validationMessage': validation_result.validation_message,
                        'aiConfidence': validation_result.confidence,
                        'reasoning': date_info.reasoning
                    })

                except Exception as e:
                    error_msg = f"AI validation failed: {str(e)}"
                    print(f"[ValidateAI] Error for {file_name}: {error_msg}", file=sys.stderr)
                    validation_details.append({
                        'slot': document_slot,
                        'fileName': file_name,
                        'payPeriod': pay_period,
                        'monthYear': None,
                        'isValid': False,
                        'validationMessage': error_msg
                    })

            # Calculate overall status
            valid_payslips = [d for d in validation_details if d['isValid']]
            required_count = 3

            overall_status = 'invalid'
            overall_reason = None

            if len(valid_payslips) == 0:
                overall_reason = 'no_valid_payslips'
            elif len(valid_payslips) < required_count:
                overall_reason = f'insufficient_payslips_{len(valid_payslips)}_of_{required_count}'
            elif len(valid_payslips) >= required_count:
                # Use AI judgment for consecutive months rather than rigid logic
                overall_status = 'valid'

                # Optional: Could add another AI call here to verify if months are consecutive
                # For now, trust that if we have 3 valid recent months, it's good

            result = {
                'status': overall_status,
                'count': len(valid_payslips),
                'reason': overall_reason,
                'details': validation_details,
                'validation_method': 'ai_powered_gemini',
                'model_used': 'gemini-2.5-flash'
            }

            print(f"[ValidateAI] Final result: {overall_status} ({len(valid_payslips)}/{required_count} valid)", file=sys.stderr)

            return {
                'success': True,
                'validation_result': result
            }

        except Exception as e:
            error_msg = f"AI validation system error: {str(e)}"
            print(f"[ValidateAI] System error: {error_msg}", file=sys.stderr)
            return {
                'success': False,
                'error': error_msg,
                'validation_method': 'ai_powered_gemini'
            }

def main():
    """Main entry point for CLI usage"""
    if len(sys.argv) != 2:
        print("Usage: python validate_payslip_dates.py <payslips_json>")
        sys.exit(1)

    try:
        # Parse input JSON containing payslip data
        payslips_json = sys.argv[1]
        payslips_data = json.loads(payslips_json)

        # Create validator and run validation
        validator = PayslipDateValidator()
        result = validator.validate_payslip_dates(payslips_data)

        # Output result as JSON
        print(json.dumps(result, indent=2))

    except Exception as e:
        error_result = {
            'success': False,
            'error': str(e),
            'error_type': type(e).__name__
        }
        print(json.dumps(error_result, indent=2))

if __name__ == "__main__":
    main()