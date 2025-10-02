#!/usr/bin/env python3
"""
Intelligent Payslip Page Grouping Engine
Groups PDF pages that belong to the same payslip period (handles multi-page payslips)
"""

import sys
import re
from typing import List, Dict, Tuple, Optional
from datetime import datetime
from collections import defaultdict, Counter

# Import models
from models.document_models import PayslipPageGroup, PayslipExtraction

class PayslipPageGrouper:
    """
    Intelligent grouper that analyzes extracted payslip data to determine
    which pages belong to the same payslip period.

    Handles cases like:
    - 1 page per payslip (simple case)
    - 2-3 pages per payslip (complex case)
    - Mixed patterns in the same PDF
    """

    def __init__(self):
        self.debug_mode = True

    def debug_log(self, message: str):
        """Debug logging to stderr"""
        if self.debug_mode:
            print(f"[PayslipGrouper] {message}", file=sys.stderr)

    def normalize_pay_period(self, pay_period: str) -> str:
        """
        Normalize pay period to MMM-YYYY format for consistent comparison
        Handles various formats like 'APR-2025', 'APRIL-2025', 'Apr 2025', etc.
        """
        if not pay_period or not isinstance(pay_period, str):
            return ""

        # Remove extra whitespace and convert to uppercase
        clean_period = pay_period.strip().upper()

        # Handle MMM-YYYY format (already normalized)
        mmm_yyyy_match = re.match(r'^([A-Z]{3})-(\d{4})$', clean_period)
        if mmm_yyyy_match:
            return clean_period

        # Handle full month names
        month_mapping = {
            'JANUARY': 'JAN', 'FEBRUARY': 'FEB', 'MARCH': 'MAR', 'APRIL': 'APR',
            'MAY': 'MAY', 'JUNE': 'JUN', 'JULY': 'JUL', 'AUGUST': 'AUG',
            'SEPTEMBER': 'SEP', 'OCTOBER': 'OCT', 'NOVEMBER': 'NOV', 'DECEMBER': 'DEC'
        }

        for full_month, abbrev in month_mapping.items():
            if full_month in clean_period:
                # Extract year from the string
                year_match = re.search(r'(\d{4})', clean_period)
                if year_match:
                    return f"{abbrev}-{year_match.group(1)}"

        # Handle numeric formats MM/YYYY, MM-YYYY
        numeric_match = re.search(r'(\d{1,2})[/-](\d{4})', clean_period)
        if numeric_match:
            month_num = int(numeric_match.group(1))
            year = numeric_match.group(2)
            month_names = ['', 'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
                          'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
            if 1 <= month_num <= 12:
                return f"{month_names[month_num]}-{year}"

        self.debug_log(f"Could not normalize pay_period: '{pay_period}'")
        return pay_period  # Return as-is if can't normalize

    def extract_page_data(self, payslips: List[PayslipExtraction]) -> List[Tuple[int, str, float]]:
        """
        Extract (page_number, pay_period, confidence) from payslip extractions
        Returns list of tuples for analysis
        """
        page_data = []

        for payslip in payslips:
            page_num = getattr(payslip, 'page_number', None)
            pay_period = getattr(payslip, 'pay_period', '')
            confidence = getattr(payslip, 'confidence_score', 0.0)

            if page_num is not None and pay_period:
                normalized_period = self.normalize_pay_period(pay_period)
                page_data.append((page_num, normalized_period, confidence))
                self.debug_log(f"Page {page_num}: '{pay_period}' -> '{normalized_period}' (confidence: {confidence:.2f})")

        return page_data

    def detect_grouping_pattern(self, page_data: List[Tuple[int, str, float]]) -> Dict[str, int]:
        """
        Analyze page data to detect how many pages typically belong to each payslip period
        Returns dict: {pay_period: page_count}
        """
        period_pages = defaultdict(list)

        # Group pages by pay period
        for page_num, pay_period, confidence in page_data:
            period_pages[pay_period].append((page_num, confidence))

        # Analyze patterns
        pages_per_period = {}
        page_counts = []

        for period, pages in period_pages.items():
            page_count = len(pages)
            pages_per_period[period] = page_count
            page_counts.append(page_count)

            self.debug_log(f"Period '{period}': {page_count} pages - {[p[0] for p in pages]}")

        # Detect common pattern
        if page_counts:
            most_common_count = Counter(page_counts).most_common(1)[0][0]
            self.debug_log(f"Most common pages per payslip: {most_common_count}")

        return pages_per_period

    def group_pages_by_period(self, page_data: List[Tuple[int, str, float]]) -> List[PayslipPageGroup]:
        """
        Group pages into PayslipPageGroup objects based on pay periods
        Handles multi-page payslips intelligently
        """
        # Detect pattern first
        pages_per_period = self.detect_grouping_pattern(page_data)

        # Group pages by period with confidence-based primary page selection
        period_groups = defaultdict(list)
        for page_num, pay_period, confidence in page_data:
            period_groups[pay_period].append((page_num, confidence))

        payslip_groups = []

        for pay_period, pages in period_groups.items():
            if not pages:
                continue

            # Sort pages by page number for consistent ordering
            pages.sort(key=lambda x: x[0])

            # Select primary page (highest confidence, or first page if ties)
            primary_page_data = max(pages, key=lambda x: (x[1], -x[0]))  # Highest confidence, lowest page number
            primary_page = primary_page_data[0]

            # Determine additional pages
            all_page_numbers = [p[0] for p in pages]
            additional_pages = [p for p in all_page_numbers if p != primary_page]

            group = PayslipPageGroup(
                pay_period=pay_period,
                page_numbers=all_page_numbers,
                primary_page=primary_page,
                additional_pages=additional_pages
            )

            payslip_groups.append(group)

            self.debug_log(f"Created group for '{pay_period}': primary={primary_page}, additional={additional_pages}")

        # Sort groups by pay period (chronological order)
        payslip_groups.sort(key=lambda g: self._parse_period_for_sorting(g.pay_period))

        return payslip_groups

    def _parse_period_for_sorting(self, pay_period: str) -> Tuple[int, int]:
        """
        Parse pay period for chronological sorting
        Returns (year, month_number) tuple
        """
        try:
            # Handle MMM-YYYY format
            if '-' in pay_period:
                month_abbr, year_str = pay_period.split('-')
                month_mapping = {
                    'JAN': 1, 'FEB': 2, 'MAR': 3, 'APR': 4, 'MAY': 5, 'JUN': 6,
                    'JUL': 7, 'AUG': 8, 'SEP': 9, 'OCT': 10, 'NOV': 11, 'DEC': 12
                }
                year = int(year_str)
                month = month_mapping.get(month_abbr.upper(), 1)
                return (year, month)
        except (ValueError, AttributeError):
            pass

        # Fallback: return current year and month 1
        return (datetime.now().year, 1)

    def merge_multi_page_payslips(self, payslips: List[PayslipExtraction], groups: List[PayslipPageGroup]) -> List[PayslipExtraction]:
        """
        Merge multi-page payslips into single PayslipExtraction objects
        Primary page provides core data, additional pages provide supplementary info
        """
        merged_payslips = []

        # Create lookup for payslips by page number
        payslip_by_page = {p.page_number: p for p in payslips if p.page_number is not None}

        for group in groups:
            # Get primary payslip
            primary_payslip = payslip_by_page.get(group.primary_page)
            if not primary_payslip:
                self.debug_log(f"Warning: No payslip found for primary page {group.primary_page}")
                continue

            # Start with primary payslip data
            merged_payslip = PayslipExtraction(
                document_type="payslip",
                employee_name=primary_payslip.employee_name,
                ic_number=primary_payslip.ic_number,
                employee_code=primary_payslip.employee_code,
                pay_period=group.pay_period,  # Use normalized pay period
                gross_wages=primary_payslip.gross_wages,
                total_deductions=primary_payslip.total_deductions,
                net_wages=primary_payslip.net_wages,
                employer_name=primary_payslip.employer_name,
                earnings_breakdown=primary_payslip.earnings_breakdown.copy(),
                deductions_breakdown=primary_payslip.deductions_breakdown.copy(),
                confidence_score=primary_payslip.confidence_score,
                page_number=group.primary_page
            )

            # Merge additional pages if any
            for add_page in group.additional_pages:
                additional_payslip = payslip_by_page.get(add_page)
                if additional_payslip:
                    # Merge earnings and deductions (avoid duplicates)
                    merged_payslip = self._merge_payslip_data(merged_payslip, additional_payslip)

            merged_payslips.append(merged_payslip)

            self.debug_log(f"Merged payslip for '{group.pay_period}': {len(group.page_numbers)} pages -> 1 payslip")

        return merged_payslips

    def _merge_payslip_data(self, primary: PayslipExtraction, additional: PayslipExtraction) -> PayslipExtraction:
        """
        Merge additional page data into primary payslip
        Focuses on combining line items while avoiding duplicates
        """
        # Combine earnings (avoid duplicates by description)
        existing_earnings = {item.description.upper() for item in primary.earnings_breakdown}
        for item in additional.earnings_breakdown:
            if item.description.upper() not in existing_earnings:
                primary.earnings_breakdown.append(item)
                existing_earnings.add(item.description.upper())

        # Combine deductions (avoid duplicates by description)
        existing_deductions = {item.description.upper() for item in primary.deductions_breakdown}
        for item in additional.deductions_breakdown:
            if item.description.upper() not in existing_deductions:
                primary.deductions_breakdown.append(item)
                existing_deductions.add(item.description.upper())

        # Update confidence (average of both pages)
        primary.confidence_score = (primary.confidence_score + additional.confidence_score) / 2

        return primary

    def group_payslip_pages(self, payslips: List[PayslipExtraction]) -> Tuple[List[PayslipExtraction], List[PayslipPageGroup], Dict[str, int], str]:
        """
        Main grouping function that handles multi-page payslip detection and merging

        Returns:
        - merged_payslips: List of PayslipExtraction (one per pay period)
        - payslip_groups: List of PayslipPageGroup (page grouping info)
        - pages_per_payslip: Dict of detected pattern
        - grouping_method: String describing the method used
        """
        if not payslips:
            return [], [], {}, "empty_input"

        self.debug_log(f"Starting payslip grouping for {len(payslips)} page extractions")

        # Step 1: Extract page data for analysis
        page_data = self.extract_page_data(payslips)

        if not page_data:
            return [], [], {}, "no_valid_pages"

        # Step 2: Detect grouping pattern
        pages_per_payslip = self.detect_grouping_pattern(page_data)

        # Step 3: Group pages by period
        payslip_groups = self.group_pages_by_period(page_data)

        # Step 4: Merge multi-page payslips
        merged_payslips = self.merge_multi_page_payslips(payslips, payslip_groups)

        # Determine grouping method
        unique_page_counts = set(pages_per_payslip.values())
        if len(unique_page_counts) == 1 and 1 in unique_page_counts:
            grouping_method = "single_page_per_payslip"
        elif len(unique_page_counts) == 1:
            grouping_method = f"uniform_{list(unique_page_counts)[0]}_pages_per_payslip"
        else:
            grouping_method = "mixed_page_patterns"

        self.debug_log(f"Grouping complete: {len(merged_payslips)} payslips from {len(payslips)} pages using '{grouping_method}'")

        return merged_payslips, payslip_groups, pages_per_payslip, grouping_method