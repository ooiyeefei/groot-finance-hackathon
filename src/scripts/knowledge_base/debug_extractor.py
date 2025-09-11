#!/usr/bin/env python3
"""
Diagnostic script to debug HTML text extraction issues
Usage: python debug_extractor.py <html_file_or_url>
"""

import sys
import re
import asyncio
import httpx
from pathlib import Path
from bs4 import BeautifulSoup
import logging

# Set up logging
logging.basicConfig(level=logging.INFO)

class HTMLExtractionDebugger:
    
    async def test_current_broken_extraction(self, html_content: str, document_id: str) -> str:
        """This is the BROKEN extraction function that's causing issues"""
        try:
            soup = BeautifulSoup(html_content, 'html.parser')
            
            # Step 1: Try to find main content container using common patterns
            main_content = None
            
            # Priority order of selectors for main content
            content_selectors = [
                'main',  # HTML5 main element
                '[role="main"]',  # ARIA main role
                '#main-content',  # Common ID patterns
                '#content',
                '#main',
                '.main-content',  # Common class patterns
                '.content',
                '.main',
                'article',  # Article elements
                '[id*="content"]',  # Any ID containing "content"
                '[class*="content"]',  # Any class containing "content"
            ]
            
            for selector in content_selectors:
                elements = soup.select(selector)
                if elements:
                    # Take the first match or the one with most text
                    main_content = max(elements, key=lambda x: len(x.get_text()))
                    print(f"[BROKEN] Found main content using selector '{selector}' for {document_id}")
                    break
            
            # Step 2: If no main content found, use body but remove common noise elements
            if not main_content:
                print(f"[BROKEN] No specific main content found for {document_id}, using body with noise removal")
                main_content = soup.find('body') or soup
                
                # Remove common noise elements including table of contents and navigation
                noise_selectors = [
                    'nav', 'header', 'footer', 'aside',  # Structural noise
                    '.navigation', '.nav', '.menu',  # Navigation
                    '.header', '.footer', '.sidebar',  # Layout
                    '.advertisement', '.ads', '.ad',  # Ads
                    '.social', '.share', '.sharing',  # Social media
                    '.breadcrumb', '.breadcrumbs',  # Breadcrumbs
                    'script', 'style', 'noscript',  # Code/styling
                    # Enhanced navigation and TOC filtering
                    '.toc', '.table-of-contents', '.contents',  # Table of contents
                    '.page-navigation', '.page-nav', '.site-nav',  # Page navigation
                    '.skip-links', '.skip-to-content',  # Skip navigation
                    '.toolbar', '.tools', '.utilities',  # Toolbars
                    '.search', '.search-form', '.search-box',  # Search boxes
                    '[class*="jump"]', '[class*="skip"]', '[class*="toggle"]',  # Jump/skip/toggle elements
                    '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]',  # ARIA navigation roles
                    # Singapore government site specific
                    '.masthead', '.sub-nav', '.utility-nav',
                    '.site-header', '.site-footer', '.page-header',
                    # Malaysia government site specific  
                    '.top-menu', '.main-menu', '.side-menu',
                    '.gov-banner', '.agency-banner'
                ]
                
                for selector in noise_selectors:
                    for element in main_content.select(selector):
                        element.decompose()
            
            # Step 3: Extract text from the main content
            if main_content:
                text = main_content.get_text(separator=' ', strip=True)
                
                # Enhanced text cleaning with navigation pattern removal
                text = re.sub(r'\s+', ' ', text)  # Normalize whitespace
                text = re.sub(r'\n\s*\n', '\n\n', text)  # Normalize line breaks
                
                # Remove specific navigation patterns that cause poor responses
                navigation_patterns = [
                    # Table of contents and navigation patterns
                    r'Jump to:\s*Select Subheading\s*expand all\s*collapse all\s*Before You Start.*?(?=\n\n|\Z)',
                    r'Jump to:\s*.*?(?=\n\n|\Z)',
                    r'Select Subheading\s*expand all\s*collapse all.*?(?=\n\n|\Z)',
                    r'expand all\s*collapse all.*?(?=\n\n|\Z)',
                    r'Toggle navigation\s*.*?(?=\n\n|\Z)',
                    r'Skip to main content.*?(?=\n\n|\Z)',
                    r'Skip navigation.*?(?=\n\n|\Z)',
                    # Common government site patterns
                    r'Site Map\s*\|\s*Privacy.*?(?=\n\n|\Z)',
                    r'Terms\s*&\s*Conditions\s*\|.*?(?=\n\n|\Z)',
                    r'Last updated:?\s*\d+.*?(?=\n\n|\Z)',
                    r'Print\s*\|\s*Email.*?(?=\n\n|\Z)',
                    # Breadcrumb patterns
                    r'Home\s*>\s*.*?(?=\n\n|\Z)',
                    r'You are here:\s*.*?(?=\n\n|\Z)',
                    # Page metadata
                    r'Page last reviewed:.*?(?=\n\n|\Z)',
                    r'This page was published on.*?(?=\n\n|\Z)',
                ]
                
                for pattern in navigation_patterns:
                    text = re.sub(pattern, '', text, flags=re.IGNORECASE | re.MULTILINE)
                
                # Remove empty lines and normalize spacing
                text = re.sub(r'\n\s*\n\s*\n', '\n\n', text)
                text = text.strip()
                
                if text.strip():
                    print(f"[BROKEN] Successfully extracted and cleaned text from HTML: {len(text)} characters")
                    return text
            
            raise ValueError(f"No meaningful content found in HTML for {document_id}")
            
        except Exception as e:
            print(f"[BROKEN] HTML text extraction failed for {document_id}: {e}")
            raise ValueError(f"Failed to extract text from HTML: {e}")

    def test_simple_extraction(self, html_content: str, document_id: str) -> str:
        """Simple extraction focusing on main content areas"""
        soup = BeautifulSoup(html_content, 'html.parser')
        
        # Remove obvious navigation and noise first
        for element in soup(['script', 'style', 'nav', 'header', 'footer']):
            element.decompose()
        
        # Try to find main content
        main_selectors = ['main', 'article', '[role="main"]', '#content', '#main-content']
        
        for selector in main_selectors:
            main_element = soup.select_one(selector)
            if main_element:
                text = main_element.get_text(separator='\n', strip=True)
                if len(text) > 500:  # Reasonable threshold
                    print(f"[SIMPLE] Found content using '{selector}': {len(text)} characters")
                    return text
        
        # Fallback to body content
        body = soup.find('body')
        if body:
            # Remove common navigation patterns
            for nav_element in body.select('.nav, .menu, .navigation, .breadcrumb, .toc, .sidebar'):
                nav_element.decompose()
            
            text = body.get_text(separator='\n', strip=True)
            print(f"[SIMPLE] Fallback to body content: {len(text)} characters")
            return text
        
        return "No content found"

    def test_minimal_extraction(self, html_content: str, document_id: str) -> str:
        """Minimal extraction - just get all paragraphs and headings"""
        soup = BeautifulSoup(html_content, 'html.parser')
        
        # Target content elements only
        content_elements = soup.find_all(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'td', 'th'])
        
        texts = []
        for element in content_elements:
            text = element.get_text(strip=True)
            if text and len(text) > 20:  # Skip very short text
                texts.append(text)
        
        result = '\n\n'.join(texts)
        print(f"[MINIMAL] Extracted from {len(content_elements)} elements: {len(result)} characters")
        return result

    async def debug_url(self, url: str):
        """Download and test extraction on a URL"""
        print(f"\n=== DEBUGGING URL: {url} ===")
        
        async with httpx.AsyncClient() as client:
            response = await client.get(url)
            html_content = response.text
        
        document_id = "test_document"
        
        # Test all three extraction methods
        print("\n--- Testing BROKEN extraction (current) ---")
        try:
            broken_result = await self.test_current_broken_extraction(html_content, document_id)
            print(f"BROKEN Result length: {len(broken_result)}")
            print(f"BROKEN Preview: {broken_result[:200]}...")
            
            # Save broken result
            with open('debug_broken_extraction.txt', 'w', encoding='utf-8') as f:
                f.write(broken_result)
            print("Saved broken extraction to debug_broken_extraction.txt")
        except Exception as e:
            print(f"BROKEN extraction failed: {e}")
        
        print("\n--- Testing SIMPLE extraction ---")
        try:
            simple_result = self.test_simple_extraction(html_content, document_id)
            print(f"SIMPLE Result length: {len(simple_result)}")
            print(f"SIMPLE Preview: {simple_result[:200]}...")
            
            # Save simple result
            with open('debug_simple_extraction.txt', 'w', encoding='utf-8') as f:
                f.write(simple_result)
            print("Saved simple extraction to debug_simple_extraction.txt")
        except Exception as e:
            print(f"SIMPLE extraction failed: {e}")
        
        print("\n--- Testing MINIMAL extraction ---")
        try:
            minimal_result = self.test_minimal_extraction(html_content, document_id)
            print(f"MINIMAL Result length: {len(minimal_result)}")
            print(f"MINIMAL Preview: {minimal_result[:200]}...")
            
            # Save minimal result
            with open('debug_minimal_extraction.txt', 'w', encoding='utf-8') as f:
                f.write(minimal_result)
            print("Saved minimal extraction to debug_minimal_extraction.txt")
        except Exception as e:
            print(f"MINIMAL extraction failed: {e}")

async def main():
    if len(sys.argv) != 2:
        print("Usage: python debug_extractor.py <url>")
        print("Example: python debug_extractor.py 'https://www.iras.gov.sg/taxes/goods-services-tax-(gst)'")
        sys.exit(1)
    
    url = sys.argv[1]
    debugger = HTMLExtractionDebugger()
    await debugger.debug_url(url)

if __name__ == "__main__":
    asyncio.run(main())