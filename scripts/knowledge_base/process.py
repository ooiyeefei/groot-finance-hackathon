#!/usr/bin/env python3
"""
Enhanced Curated RAG Document Processing Pipeline
Professional checksum validation and intelligent document processing
for Southeast Asian regulatory compliance documents.

Features:
- Checksum validation for versioned document management
- Intelligent PDF text extraction with multiple fallback methods
- Regulatory-aware text chunking with contextual boundaries
- Comprehensive error handling and audit logging
- Production-ready validation and quality assurance
"""

import os
import sys
import json
import yaml
import hashlib
import logging
import asyncio
import io
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass, asdict
from urllib.parse import urlparse, urljoin

# Core processing libraries
import httpx
import pdfplumber
import fitz  # PyMuPDF
import pytesseract
from PIL import Image
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse
import nltk
from nltk.tokenize import sent_tokenize
import chardet
from tqdm import tqdm
import re

# Download required NLTK data automatically
def ensure_nltk_data():
    required_resources = ['punkt', 'punkt_tab']
    for resource in required_resources:
        try:
            nltk.data.find(f'tokenizers/{resource}')
        except LookupError:
            print(f"NLTK '{resource}' resource not found. Downloading...")
            nltk.download(resource, quiet=True)
            print(f"'{resource}' resource downloaded successfully.")

# Ensure all required NLTK data is available
ensure_nltk_data()

@dataclass
class ProcessedChunk:
    """Enhanced chunk structure for curated RAG pipeline"""
    id: str
    text: str
    metadata: Dict[str, Any]
    source_document: Dict[str, Any]
    processing_info: Dict[str, Any]

class ChecksumManager:
    """Professional checksum validation for versioned document management"""
    
    def __init__(self, checksum_file: str = "checksums.json"):
        self.checksum_file = checksum_file
        self.checksums = self._load_checksums()
        
    def _load_checksums(self) -> Dict[str, str]:
        """Load existing checksums from file"""
        if Path(self.checksum_file).exists():
            try:
                with open(self.checksum_file, 'r') as f:
                    return json.load(f)
            except Exception as e:
                logging.warning(f"Failed to load checksums: {e}")
        return {}
    
    def calculate_checksum(self, content: bytes) -> str:
        """Calculate SHA256 checksum for content"""
        return hashlib.sha256(content).hexdigest()
    
    def has_changed(self, document_id: str, content: bytes) -> bool:
        """Check if document has changed since last processing"""
        current_checksum = self.calculate_checksum(content)
        stored_checksum = self.checksums.get(document_id)
        
        if stored_checksum != current_checksum:
            logging.info(f"Document {document_id} has changed or is new")
            return True
            
        logging.info(f"Document {document_id} unchanged, skipping processing")
        return False
    
    def update_checksum(self, document_id: str, content: bytes):
        """Update stored checksum for document"""
        self.checksums[document_id] = self.calculate_checksum(content)
        
    def save_checksums(self):
        """Save checksums to file"""
        try:
            with open(self.checksum_file, 'w') as f:
                json.dump(self.checksums, f, indent=2)
            logging.info(f"Checksums saved to {self.checksum_file}")
        except Exception as e:
            logging.error(f"Failed to save checksums: {e}")

class DocumentDownloader:
    """Professional document acquisition with retry logic and validation"""
    
    def __init__(self, max_retries: int = 3, timeout: int = 30):
        self.max_retries = max_retries
        self.timeout = timeout
        self.session = None
        
    async def __aenter__(self):
        self.session = httpx.AsyncClient(
            timeout=httpx.Timeout(self.timeout),
            follow_redirects=True,
            headers={
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
            }
        )
        return self
        
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.aclose()
    
    async def download_with_retry(self, document: Dict[str, Any]) -> Tuple[bool, Any, str, str]:
        """Smart downloader with exponential backoff retry logic - handles both PDF and HTML content types
        
        Returns:
            Tuple[bool, Union[bytes, str], str, str]: (success, content, content_type, error_msg)
        """
        document_id = document['id']
        url = document['url']
        
        for attempt in range(self.max_retries):
            try:
                logging.info(f"Smart downloading {document_id} (attempt {attempt + 1}/{self.max_retries})")
                
                # Step A: Check if URL is a direct PDF link
                if url.lower().endswith('.pdf') or '.pdf?' in url.lower():
                    logging.info(f"Direct PDF detected for {document_id}")
                    pdf_content = await self._download_direct_pdf(url, document_id)
                    return True, pdf_content, "pdf", ""
                
                # Step B: First check content type by making a HEAD request
                else:
                    logging.info(f"Checking content type for {document_id}")
                    head_response = await self.session.head(url)
                    content_type = head_response.headers.get('content-type', '').lower()
                    
                    if 'pdf' in content_type or 'application/pdf' in content_type:
                        # It's actually a PDF served as HTML page
                        logging.info(f"PDF content detected via headers for {document_id}")
                        pdf_content = await self._download_direct_pdf(url, document_id)
                        return True, pdf_content, "pdf", ""
                    
                    elif 'html' in content_type or 'text/html' in content_type:
                        # Step C: Handle HTML content - either extract PDF links or return HTML
                        logging.info(f"HTML content detected for {document_id}")
                        
                        # Try to find PDF links first (existing behavior)
                        try:
                            pdf_content = await self._download_from_html_page(url, document_id, document)
                            return True, pdf_content, "pdf", ""
                        except ValueError as e:
                            # No PDF found, return HTML content directly
                            logging.info(f"No PDF links found in HTML for {document_id}, returning HTML content: {e}")
                            html_content = await self._download_html_content(url, document_id)
                            return True, html_content, "html", ""
                    
                    else:
                        # Unknown content type, try as HTML page with PDF search
                        logging.info(f"Unknown content type '{content_type}' for {document_id}, trying HTML page approach")
                        try:
                            pdf_content = await self._download_from_html_page(url, document_id, document)
                            return True, pdf_content, "pdf", ""
                        except ValueError:
                            # Fallback to HTML content
                            html_content = await self._download_html_content(url, document_id)
                            return True, html_content, "html", ""
                
            except Exception as e:
                error_msg = f"Download attempt {attempt + 1} failed for {document_id}: {e}"
                logging.error(error_msg)
                if attempt < self.max_retries - 1:
                    await asyncio.sleep(2 ** attempt)  # Exponential backoff
                else:
                    return False, None, "", error_msg
        
        return False, None, "", f"Maximum retries exceeded for {document_id}"
    
    async def _download_direct_pdf(self, url: str, document_id: str) -> bytes:
        """Download content from a direct PDF URL"""
        response = await self.session.get(url)
        response.raise_for_status()
        
        # Validate content type
        content_type = response.headers.get('content-type', '').lower()
        if 'pdf' not in content_type and 'application/pdf' not in content_type:
            logging.warning(f"Unexpected content type for {document_id}: {content_type}")
        
        content = response.content
        
        # Basic PDF validation
        if not content.startswith(b'%PDF'):
            raise ValueError(f"Invalid PDF format for {document_id}")
        
        logging.info(f"Successfully downloaded direct PDF {document_id} ({len(content)} bytes)")
        return content
    
    async def _download_html_content(self, url: str, document_id: str) -> str:
        """Download HTML content and return as text"""
        response = await self.session.get(url)
        response.raise_for_status()
        
        if response.status_code != 200:
            raise ValueError(f"Failed to access HTML page: {response.status_code}")
        
        html_content = response.text
        logging.info(f"Successfully downloaded HTML content for {document_id} ({len(html_content)} chars)")
        return html_content
    
    async def _download_from_html_page(self, url: str, document_id: str, document: Dict[str, Any]) -> bytes:
        """Download PDF from HTML landing page using intelligent scoring to find the most relevant PDF"""
        # Step 1: Download HTML content
        response = await self.session.get(url)
        response.raise_for_status()
        
        if response.status_code != 200:
            raise ValueError(f"Failed to access HTML page: {response.status_code}")
        
        html_content = response.text
        logging.info(f"Downloaded HTML page for {document_id} ({len(html_content)} chars)")
        
        # Step 2: Parse HTML with BeautifulSoup
        soup = BeautifulSoup(html_content, 'html.parser')
        
        # Step 3: Find all anchor tags and search for PDF links with scoring
        pdf_candidates = []
        for link in soup.find_all('a', href=True):
            href = link['href']
            
            # Check if the link contains .pdf
            if '.pdf' in href.lower():
                # Step 4: Construct absolute URL (handle relative links)
                absolute_url = urljoin(url, href)
                
                # Get link text for scoring
                link_text = link.get_text(strip=True)
                
                # Store candidate with URL and text for scoring
                pdf_candidates.append({
                    'url': absolute_url,
                    'text': link_text,
                    'element': link
                })
                logging.info(f"Found PDF candidate: {link_text} -> {absolute_url}")
        
        if not pdf_candidates:
            raise ValueError(f"No PDF links found on HTML page for {document_id}")
        
        # Step 5: Score each PDF candidate using intelligent keyword matching
        best_candidate = self._score_pdf_candidates(pdf_candidates, document)
        
        logging.info(f"Best match found: \"{best_candidate['text']}\" with score {best_candidate['score']}. Downloading...")
        
        return await self._download_direct_pdf(best_candidate['url'], document_id)
    
    def _score_pdf_candidates(self, pdf_candidates: list, document: Dict[str, Any]) -> dict:
        """Score PDF candidates based on keyword matching with source_name - implements intelligent scoring heuristic with minimum threshold and recency tie-breaker"""
        
        # Step 1: Get the target document's source_name for keyword extraction
        source_name = document.get('source_name', '')
        document_id = document.get('id', '')
        
        # Step 2: Create keywords by splitting source_name into individual words (lowercase, ignore common words)
        common_stop_words = {'the', 'for', 'of', 'and', 'or', 'a', 'an', 'in', 'on', 'at', 'to', 'by', 'with', 'from', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'cannot', 'no'}
        
        # Split source_name into words, convert to lowercase, filter out stop words and short words
        raw_words = source_name.lower().replace('(', ' ').replace(')', ' ').replace('-', ' ').split()
        keywords = [word.strip('.,;:!?"()[]{}') for word in raw_words 
                   if len(word.strip('.,;:!?"()[]{}')) > 2 and word.lower() not in common_stop_words]
        
        logging.info(f"Extracted keywords from source_name '{source_name}': {keywords}")
        
        best_score = -1
        
        # Step 3: Score each PDF link found on the page
        for candidate in pdf_candidates:
            # Step 4: Initialize score for this link at 0
            score = 0
            link_text = candidate['text']
            link_text_lower = link_text.lower()
            
            logging.info(f"Scoring link: \"{link_text}\"")
            
            # Step 5: For each keyword, check if it appears in link text (case-insensitive)
            matched_keywords = []
            for keyword in keywords:
                if keyword in link_text_lower:
                    score += 1
                    matched_keywords.append(keyword)
                    logging.info(f"  ✓ Keyword '{keyword}' found in link text")
            
            candidate['score'] = score
            candidate['matched_keywords'] = matched_keywords
            
            logging.info(f"  Final score for \"{link_text}\": {score} (matched: {matched_keywords})")
            
            # Step 6: Track the highest scoring link
            if score > best_score:
                best_score = score
        
        # Step 7: MINIMUM SCORE THRESHOLD - New quality control rule
        if best_score < 1:
            logging.warning(f"WARN - No confident match found for '{source_name}'. Highest score was {best_score}. Skipping.")
            raise ValueError(f"No confident PDF match found for document '{source_name}' (highest score: {best_score})")
        
        # Step 8: Find all candidates with the best score (handle ties)
        top_candidates = [candidate for candidate in pdf_candidates if candidate['score'] == best_score]
        
        if len(top_candidates) == 1:
            # Single best candidate
            best_candidate = top_candidates[0]
            logging.info(f"Clear winner found: \"{best_candidate['text']}\" with score {best_score}")
        else:
            # Step 9: RECENCY TIE-BREAKER - New tie-breaking rule
            logging.info(f"Tie detected! {len(top_candidates)} candidates with score {best_score}. Applying recency tie-breaker...")
            best_candidate = self._apply_recency_tiebreaker(top_candidates, source_name)
        
        return best_candidate
    
    def _apply_recency_tiebreaker(self, tied_candidates: list, source_name: str) -> dict:
        """Apply recency tie-breaker by finding the candidate with the highest year in link text"""
        
        best_year = -1
        best_candidate = None
        
        for candidate in tied_candidates:
            link_text = candidate['text']
            
            # Look for 4-digit years in the link text (e.g., 2023, 2024, 2025)
            import re
            year_matches = re.findall(r'\b(20\d{2})\b', link_text)
            
            if year_matches:
                # Find the highest year in this link
                candidate_year = max(int(year) for year in year_matches)
                logging.info(f"  Link \"{link_text}\": Found year {candidate_year}")
                
                if candidate_year > best_year:
                    best_year = candidate_year
                    best_candidate = candidate
            else:
                logging.info(f"  Link \"{link_text}\": No year found")
        
        if best_candidate:
            logging.info(f"Recency tie-breaker winner: \"{best_candidate['text']}\" (year: {best_year})")
            return best_candidate
        else:
            # No years found in any tied links - default to first
            fallback_candidate = tied_candidates[0]
            logging.info(f"No years found in tied candidates. Defaulting to first: \"{fallback_candidate['text']}\"")
            return fallback_candidate

class RegulatoryTextProcessor:
    """Intelligent text processing for regulatory documents"""
    
    def __init__(self, chunk_size: int = 1000, overlap: int = 200):
        self.chunk_size = chunk_size
        self.overlap = overlap
        
        # Regulatory-specific section patterns
        self.section_patterns = [
            r'Section \d+\.?\d*',
            r'Article \d+\.?\d*', 
            r'Regulation \d+\.?\d*',
            r'Chapter [IVXLC]+',
            r'\d+\.\d+\.?\d*',  # Numbered subsections
            r'Part [IVXLC]+',
            r'Schedule \d+',
            r'Appendix [A-Z]+',
            r'Clause \d+\.?\d*'
        ]
    
    async def extract_text(self, content: Any, content_type: str, document_id: str) -> str:
        """Extract text from both PDF and HTML content using multiple fallback methods
        
        Args:
            content: Either bytes (PDF) or str (HTML)
            content_type: "pdf" or "html"
            document_id: Document identifier for logging
        """
        if content_type == "html":
            return await self._extract_text_from_html(content, document_id)
        elif content_type == "pdf":
            return await self._extract_text_from_pdf(content, document_id)
        else:
            raise ValueError(f"Unsupported content type: {content_type}")
    
    async def _extract_text_from_html(self, html_content: str, document_id: str) -> str:
        """Extract text from HTML content using simple and reliable extraction logic"""
        try:
            soup = BeautifulSoup(html_content, 'html.parser')
            
            # Remove obvious navigation and noise first
            for element in soup(['script', 'style', 'nav', 'header', 'footer']):
                element.decompose()
            
            # Try to find main content using simple selectors
            main_selectors = ['main', 'article', '[role="main"]', '#content', '#main-content']
            
            for selector in main_selectors:
                main_element = soup.select_one(selector)
                if main_element:
                    text = main_element.get_text(separator='\n', strip=True)
                    if len(text) > 500:  # Reasonable threshold for meaningful content
                        logging.info(f"Found content using '{selector}': {len(text)} characters")
                        
                        # Basic text cleaning
                        text = re.sub(r'\s+', ' ', text)  # Normalize whitespace
                        text = re.sub(r'\n\s*\n\s*\n', '\n\n', text)  # Normalize line breaks
                        text = text.strip()
                        
                        return text
            
            # Fallback to body content with basic noise removal
            body = soup.find('body')
            if body:
                # Remove common navigation patterns from body
                for nav_element in body.select('.nav, .menu, .navigation, .breadcrumb, .toc, .sidebar'):
                    nav_element.decompose()
                
                text = body.get_text(separator='\n', strip=True)
                logging.info(f"Fallback to body content: {len(text)} characters")
                
                # Basic text cleaning
                text = re.sub(r'\s+', ' ', text)  # Normalize whitespace  
                text = re.sub(r'\n\s*\n\s*\n', '\n\n', text)  # Normalize line breaks
                
                # Remove common navigation text patterns
                navigation_patterns = [
                    r'Turn on more accessible mode.*?(?=\n|\Z)',
                    r'Turn off more accessible mode.*?(?=\n|\Z)',
                    r'Skip to main content.*?(?=\n|\Z)',
                    r'Jump to:.*?(?=\n|\Z)',
                    r'Site Map\s*\|\s*Privacy.*?(?=\n|\Z)',
                    r'Last updated:?\s*\d+.*?(?=\n|\Z)',
                    r'Go to next level.*?(?=\n|\Z)',
                    r'Close menu.*?(?=\n|\Z)',
                ]
                
                for pattern in navigation_patterns:
                    text = re.sub(pattern, '', text, flags=re.IGNORECASE | re.MULTILINE)
                
                text = text.strip()
                
                if text and len(text) > 100:
                    logging.info(f"Successfully extracted text from HTML body: {len(text)} characters")
                    return text
            
            raise ValueError(f"No meaningful content found in HTML for {document_id}")
            
        except Exception as e:
            logging.error(f"HTML text extraction failed for {document_id}: {e}")
            raise ValueError(f"Failed to extract text from HTML: {e}")
    
    async def _extract_text_from_pdf(self, content: bytes, document_id: str) -> str:
        """Extract text from PDF content using multiple fallback methods"""
        text = ""
        
        # Method 1: pdfplumber (best for structured documents)
        try:
            with pdfplumber.open(io.BytesIO(content)) as pdf:
                for page in pdf.pages:
                    page_text = page.extract_text()
                    if page_text:
                        text += page_text + "\n"
                
                if text.strip():
                    logging.info(f"Successfully extracted text using pdfplumber: {len(text)} characters")
                    return text
        except Exception as e:
            logging.warning(f"pdfplumber extraction failed for {document_id}: {e}")
        
        # Method 2: PyMuPDF (fallback for complex layouts)
        try:
            doc = fitz.open("pdf", content)
            for page in doc:
                text += page.get_text() + "\n"
            doc.close()
            
            if text.strip():
                logging.info(f"Successfully extracted text using PyMuPDF: {len(text)} characters")
                return text
        except Exception as e:
            logging.warning(f"PyMuPDF extraction failed for {document_id}: {e}")
        
        # Method 3: OCR fallback (for scanned documents)
        try:
            logging.info(f"Attempting OCR extraction for {document_id}")
            doc = fitz.open("pdf", content)
            for page_num in range(len(doc)):
                page = doc.load_page(page_num)
                pix = page.get_pixmap()
                img_data = pix.tobytes("png")
                
                # Convert to PIL Image and run OCR
                img = Image.open(io.BytesIO(img_data))
                page_text = pytesseract.image_to_string(img)
                text += page_text + "\n"
            
            doc.close()
            
            if text.strip():
                logging.info(f"Successfully extracted text using OCR: {len(text)} characters")
                return text
        except Exception as e:
            logging.error(f"OCR extraction failed for {document_id}: {e}")
        
        return text
    
    def clean_text(self, text: str) -> str:
        """Clean and normalize regulatory text with robust, bidirectional acronym expansion."""
        
        # --- Stage 1: Enhanced Header/Footer Removal ---
        # Split into lines for targeted cleaning
        lines = text.split('\n')
        cleaned_lines = []
        
        # Define footer/header patterns that reduce semantic quality
        footer_patterns = [
            re.compile(r'^.*best viewed in.*google chrome.*resolution.*$', re.IGNORECASE),
            re.compile(r'^.*privacy policy\s*\|.*security policy.*$', re.IGNORECASE),
            re.compile(r'^.*terms\s*&\s*conditions\s*\|.*policy.*$', re.IGNORECASE),
            re.compile(r'^.*copyright.*suruhanjaya syarikat malaysia.*$', re.IGNORECASE),
            re.compile(r'^.*sign in.*username.*password.*verification code.*$', re.IGNORECASE),
            re.compile(r'^.*guideline\s*\|.*terms.*conditions.*policy.*$', re.IGNORECASE),
            re.compile(r'^page \d+ of \d+$', re.IGNORECASE),
            re.compile(r'^\d+\s*$'),  # Standalone page numbers
            re.compile(r'^.*hotline:\s*\d+-\d+-\d+.*$', re.IGNORECASE),  # Contact hotlines
        ]
        
        for line in lines:
            line = line.strip()
            if line and not any(pattern.search(line) for pattern in footer_patterns):
                cleaned_lines.append(line)
        
        text = '\n'.join(cleaned_lines)
        
        # Standard cleaning
        text = re.sub(r'\s+', ' ', text)
        # Normalize quotation marks
        text = re.sub(r'[""]', '"', text)
        text = re.sub(r"[''']", "'", text)
        # Remove excessive line breaks
        text = re.sub(r'\n\s*\n\s*\n', '\n\n', text)

        # --- Stage 2: Bidirectional Acronym Expansion ---
        acronym_map = {
            "OVR": "Overseas Vendor Registration",
            "GST": "Goods and Services Tax",
            "SST": "Sales and Service Tax",
            "DST": "Digital Services Tax",
            "DTAA": "Double Taxation Avoidance Agreement",
            "MAP": "Mutual Agreement Procedure",
            "IRAS": "Inland Revenue Authority of Singapore",
            "LHDN": "Lembaga Hasil Dalam Negeri",
            "ACRA": "Accounting and Corporate Regulatory Authority",
            "SSM": "Suruhanjaya Syarikat Malaysia",
            "CRS": "Common Reporting Standard",
            "FATCA": "Foreign Account Tax Compliance Act",
            "MLI": "Multilateral Instrument",
            "APA": "Advance Pricing Arrangement",
            "CFC": "Controlled Foreign Company",
            "RPGT": "Real Property Gains Tax",
            "BEPS": "Base Erosion and Profit Shifting",
            "GMT": "Global Minimum Tax"
        }

        # Pass 1: Replace full phrase with "Full Phrase (Acronym)"
        # This ensures the acronym is always present with its definition.
        for acronym, full_phrase in acronym_map.items():
            # Use a negative lookahead `(?!\s*\({acronym}\))` to avoid double-adding the acronym
            pattern = re.compile(rf'\b{re.escape(full_phrase)}\b(?!\s*\({acronym}\))', re.IGNORECASE)
            replacement = f"{full_phrase} ({acronym})"
            text = pattern.sub(replacement, text)

        # Pass 2: Replace standalone acronym with "Full Phrase (Acronym)"
        # This ensures the definition is always present with the acronym.
        for acronym, full_phrase in acronym_map.items():
            # Use word boundaries `\b` to match only the whole word acronym
            pattern = re.compile(rf'\b{re.escape(acronym)}\b', re.IGNORECASE)
            replacement = f"{full_phrase} ({acronym})"
            text = pattern.sub(replacement, text)
            
        return text.strip()
    
    def chunk_text(self, text: str, document: Dict[str, Any]) -> List[ProcessedChunk]:
        """Create contextually intelligent chunks for regulatory text"""
        
        # Clean and normalize text
        cleaned_text = self.clean_text(text)
        
        # Split into sentences for boundary detection
        sentences = sent_tokenize(cleaned_text)
        
        chunks = []
        current_chunk = ""
        current_sentences = []
        chunk_index = 0
        
        for i, sentence in enumerate(sentences):
            # Check if adding this sentence would exceed chunk size
            potential_chunk = current_chunk + " " + sentence if current_chunk else sentence
            
            if len(potential_chunk) > self.chunk_size and current_chunk:
                # Create chunk with current content
                chunk = self._create_chunk(
                    current_chunk.strip(),
                    chunk_index,
                    document,
                    sentences,
                    i - len(current_sentences),
                    i
                )
                chunks.append(chunk)
                
                # Start new chunk with overlap
                overlap_sentences = current_sentences[-self._calculate_overlap_sentences(current_sentences):]
                current_chunk = " ".join(overlap_sentences) + " " + sentence
                current_sentences = overlap_sentences + [sentence]
                chunk_index += 1
            else:
                current_chunk = potential_chunk
                current_sentences.append(sentence)
        
        # Handle final chunk
        if current_chunk.strip():
            chunk = self._create_chunk(
                current_chunk.strip(),
                chunk_index,
                document,
                sentences,
                len(sentences) - len(current_sentences),
                len(sentences)
            )
            chunks.append(chunk)
        
        logging.info(f"Created {len(chunks)} chunks from {document['id']}")
        return chunks
    
    def _create_chunk(
        self, 
        text: str, 
        chunk_index: int, 
        document: Dict[str, Any],
        all_sentences: List[str],
        start_sentence: int,
        end_sentence: int
    ) -> ProcessedChunk:
        """Create comprehensive chunk with metadata"""
        
        # Generate unique chunk ID
        content_hash = hashlib.md5(text.encode()).hexdigest()[:8]
        chunk_id = f"{document['id']}_chunk_{chunk_index}_{content_hash}"
        
        # Detect context sections
        preceding_section = self._detect_section(all_sentences, start_sentence - 5, start_sentence)
        following_section = self._detect_section(all_sentences, end_sentence, end_sentence + 5)
        
        return ProcessedChunk(
            id=chunk_id,
            text=text,
            metadata={
                'document_id': document['id'],
                'country': document['country'],
                'tax_type': document['tax_type'],
                'source_name': document['source_name'],
                'topics': document['topics'],
                'language': document['language'],
                'document_version': document['document_version'],
                'url': document.get('url', ''),  # Add URL from sources.yaml
                'chunk_index': chunk_index,
                'char_count': len(text),
                'sentence_range': [start_sentence, end_sentence],
                'preceding_section': preceding_section,
                'following_section': following_section
            },
            source_document={
                'id': document['id'],
                'url': document['url'],
                'priority': document['priority'],
                'last_checked_date': document['last_checked_date']
            },
            processing_info={
                'processed_at': datetime.now().isoformat(),
                'chunk_method': 'regulatory_aware',
                'text_extraction_method': 'multi_fallback',
                'confidence_score': 1.0
            }
        )
    
    def _detect_section(self, sentences: List[str], start: int, end: int) -> str:
        """Detect section headers in sentence range"""
        start = max(0, start)
        end = min(len(sentences), end)
        
        for i in range(start, end):
            sentence = sentences[i]
            for pattern in self.section_patterns:
                if re.search(pattern, sentence, re.IGNORECASE):
                    return sentence[:100] + "..." if len(sentence) > 100 else sentence
        
        return ""
    
    def _calculate_overlap_sentences(self, sentences: List[str]) -> int:
        """Calculate optimal overlap in sentences based on content"""
        total_chars = sum(len(s) for s in sentences)
        if total_chars == 0:
            return 0
        
        target_overlap_chars = min(self.overlap, total_chars // 3)
        overlap_sentences = 0
        overlap_chars = 0
        
        for i in range(len(sentences) - 1, -1, -1):
            if overlap_chars + len(sentences[i]) <= target_overlap_chars:
                overlap_chars += len(sentences[i])
                overlap_sentences += 1
            else:
                break
        
        return min(overlap_sentences, len(sentences) // 2)

class CuratedRAGProcessor:
    """Main processor for curated RAG pipeline"""
    
    def __init__(self, config_path: str = "sources.yaml", force_reprocess: bool = False):
        self.config_path = config_path
        self.config = self._load_config()
        self.force_reprocess = force_reprocess
        self.setup_logging()
        
        # Initialize components
        self.checksum_manager = ChecksumManager(
            self.config.get('processing_config', {}).get('checksum_file', 'checksums.json')
        )
        self.text_processor = RegulatoryTextProcessor(
            chunk_size=self.config.get('processing_config', {}).get('chunk_size', 1000),
            overlap=self.config.get('processing_config', {}).get('chunk_overlap', 200)
        )
        
        # Create output directory
        Path("output").mkdir(exist_ok=True)
        
        if self.force_reprocess:
            logging.info("⚠️  FORCE REPROCESS MODE ENABLED - All documents will be reprocessed regardless of checksums")
    
    def _load_config(self) -> Dict[str, Any]:
        """Load configuration from YAML file"""
        try:
            with open(self.config_path, 'r') as f:
                return yaml.safe_load(f)
        except Exception as e:
            logging.error(f"Failed to load config from {self.config_path}: {e}")
            sys.exit(1)
    
    def setup_logging(self):
        """Configure comprehensive logging"""
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(levelname)s - %(message)s',
            handlers=[
                logging.FileHandler('output/processing.log'),
                logging.StreamHandler(sys.stdout)
            ]
        )
    
    async def process_all_documents(self) -> Dict[str, Any]:
        """Main processing pipeline with checksum validation"""
        logging.info("Starting Curated RAG document processing pipeline")
        
        sources = self.config.get('regulatory_sources', [])
        all_chunks = []
        processing_report = {
            'started_at': datetime.now().isoformat(),
            'total_sources': len(sources),
            'processed_sources': 0,
            'skipped_sources': 0,
            'failed_sources': 0,
            'total_chunks': 0,
            'errors': []
        }
        
        async with DocumentDownloader() as downloader:
            for i, document in enumerate(sources):
                try:
                    document_id = document['id']
                    logging.info(f"Processing document {i+1}/{len(sources)}: {document_id}")
                    
                    # Download document
                    success, content, content_type, error_msg = await downloader.download_with_retry(document)
                    
                    if not success:
                        error_msg = f"Failed to download {document_id}: {error_msg}"
                        logging.error(error_msg)
                        processing_report['errors'].append(error_msg)
                        processing_report['failed_sources'] += 1
                        continue
                    
                    # For checksum validation, we need bytes. Convert HTML to bytes for checksum
                    checksum_content = content.encode('utf-8') if content_type == "html" else content
                    
                    # Check if document has changed (checksum validation) - skip if force reprocess enabled
                    if not self.force_reprocess and not self.checksum_manager.has_changed(document_id, checksum_content):
                        logging.info(f"Document {document_id} unchanged, skipping")
                        processing_report['skipped_sources'] += 1
                        continue
                    elif self.force_reprocess:
                        logging.info(f"🔄 Force reprocessing {document_id} (checksum validation bypassed)")
                    
                    # Extract text
                    text = await self.text_processor.extract_text(content, content_type, document_id)
                    if not text.strip():
                        error_msg = f"No text extracted from {document_id}"
                        logging.error(error_msg)
                        processing_report['errors'].append(error_msg)
                        processing_report['failed_sources'] += 1
                        continue
                    
                    # Chunk the document
                    chunks = self.text_processor.chunk_text(text, document)
                    
                    if chunks:
                        all_chunks.extend(chunks)
                        processing_report['processed_sources'] += 1
                        processing_report['total_chunks'] += len(chunks)
                        
                        # Update checksum after successful processing
                        self.checksum_manager.update_checksum(document_id, checksum_content)
                        
                        logging.info(f"Successfully processed {document_id} - {len(chunks)} chunks created")
                    else:
                        error_msg = f"No chunks created from {document_id}"
                        logging.error(error_msg)
                        processing_report['errors'].append(error_msg)
                        processing_report['failed_sources'] += 1
                    
                except Exception as e:
                    error_msg = f"Error processing {document.get('id', 'unknown')}: {str(e)}"
                    logging.error(error_msg)
                    processing_report['errors'].append(error_msg)
                    processing_report['failed_sources'] += 1
        
        # Save checksums and results
        self.checksum_manager.save_checksums()
        processing_report['completed_at'] = datetime.now().isoformat()
        await self._save_results(all_chunks, processing_report)
        
        logging.info(f"Processing complete: {processing_report['processed_sources']}/{processing_report['total_sources']} documents processed, {processing_report['skipped_sources']} skipped, {processing_report['total_chunks']} chunks created")
        
        return processing_report
    
    async def _save_results(self, chunks: List[ProcessedChunk], report: Dict[str, Any]):
        """Save processing results to JSON files"""
        
        # Convert chunks to serializable format
        chunks_data = [asdict(chunk) for chunk in chunks]
        
        output_file = self.config.get('processing_config', {}).get('output_file', 'processed_chunks.json')
        
        # Save processed chunks
        with open(f'output/{output_file}', 'w', encoding='utf-8') as f:
            json.dump(chunks_data, f, indent=2, ensure_ascii=False)
        
        # Save processing report
        with open('output/processing_report.json', 'w', encoding='utf-8') as f:
            json.dump(report, f, indent=2, ensure_ascii=False)
        
        logging.info(f"Results saved: {len(chunks)} chunks to {output_file}")

async def main():
    """Main entry point for curated RAG processing"""
    import argparse
    
    parser = argparse.ArgumentParser(description="Curated RAG Document Processing Pipeline")
    parser.add_argument("--force-reprocess", action="store_true", 
                       help="Force reprocessing of all documents, ignoring checksum validation")
    
    args = parser.parse_args()
    
    processor = CuratedRAGProcessor(force_reprocess=args.force_reprocess)
    
    try:
        report = await processor.process_all_documents()
        
        if report['processed_sources'] > 0:
            print(f"\n✅ Curated RAG processing completed successfully!")
            print(f"📄 Processed: {report['processed_sources']}/{report['total_sources']} documents")
            print(f"⏭️  Skipped: {report['skipped_sources']} unchanged documents")
            print(f"📦 Generated: {report['total_chunks']} regulatory chunks")
            print(f"💾 Output: processed_chunks.json")
            
            if report['failed_sources'] > 0:
                print(f"⚠️  Failed: {report['failed_sources']} documents (see processing.log)")
        else:
            print(f"\n❌ No documents processed successfully")
            print(f"Check processing.log for detailed errors")
            sys.exit(1)
            
    except Exception as e:
        logging.error(f"Pipeline failed: {e}")
        print(f"\n❌ Pipeline failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())