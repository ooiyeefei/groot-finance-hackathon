What is Direct Ingestion?
  - Direct Database Access: The ingestion script connects directly to Qdrant Cloud using proper
  authentication and API credentials
  - Automated Processing: Complete end-to-end ingestion in a single script execution without
  manual intervention
  - Separate Collection Architecture: Regulatory knowledge is stored in dedicated regulatory_kb
  collection, separate from user documents (finanseal-documents)

  How It Works:
  graph TD
      A[Processed Chunks] --> B[Direct Ingestion Script]
      B --> C[Embedding Generation]
      C --> D[Batch Processing]
      D --> E[Qdrant Cloud Database]
      E --> F[regulatory_kb Collection]

  Technical Flow:
  1. Chunk Processing: process.py creates 2,168 regulatory chunks with metadata
  2. Direct Ingestion: ingest.py performs automated batch processing with embedding generation
  3. Collection Management: Ensures regulatory_kb collection exists with proper indexing
  4. Embedding Service: Uses LiteLLM endpoint with Qwen3-4B embeddings (2560 dimensions)
  5. Vector Storage: All chunks stored automatically in regulatory_kb collection

⏺ 2. One-Time vs Recurring Operations

  Process & Ingest Scripts Are Primarily One-Time Operations

  Initial Knowledge Base Creation (One-Time):
  - ✅ First Run: When setting up the RAG system for the first time
  - ✅ Source Addition: When adding new regulatory documents to sources.yaml
  - ✅ Major Updates: When regulatory authorities release new versions of documents

  Recurring Scenarios (Occasional):
  - 📅 Quarterly Updates: Singapore IRAS updates GST guides, Malaysia LHDN releases new tax
  circulars
  - 🔄 URL Changes: Government websites restructure, requiring sources.yaml updates
  - 🆕 New Jurisdictions: Expanding to Thailand, Indonesia, Philippines tax regulations
  - 🐛 Bug Fixes: Improving chunking logic or PDF extraction methods

  Current Status:
  # What we've completed (one-time setup):
  ✅ Enhanced process.py with intelligent PDF scoring
  ✅ Generated 2,168 processed chunks in processed_chunks.json
  ✅ Implemented automated direct ingestion script (ingest.py)
  ✅ Architectural correction: regulatory_kb collection separation
  ✅ Directory cleanup: removed obsolete ingestion scripts

  # What remains (one-time completion):
  🔄 Execute automated ingestion: python ingest.py (all 2,168 chunks)
  🔄 Update CrossBorderTaxComplianceTool to use regulatory_kb collection

⏺ 3. Operational Workflow for Future Updates

  When to Re-Run the Pipeline:

  Scenario A: New Document Sources (Quarterly/Semi-Annual)
  # 1. Update sources.yaml with new documents
  # 2. Run incremental processing
  cd src/scripts/knowledge_base
  python process.py --incremental  # Only process new/changed documents

  # 3. Run automated ingestion for new chunks
  python ingest.py  # Automatically handles new chunks

  Scenario B: Complete Refresh (Annual/Major Changes)
  # 1. Archive existing collection (optional backup)
  # 2. Clear processed chunks and start fresh
  rm output/processed_chunks.json

  # 3. Full pipeline re-run
  python process.py  # Process all documents
  python ingest.py   # Automated ingestion of all chunks

  Scenario C: Bug Fixes or Algorithm Improvements
  # Example: Enhanced chunking algorithm for better regulatory context
  python process.py --force-reprocess  # Override checksum validation
  python ingest.py                     # Re-ingest with improved chunks

⏺ 4. Detailed Chunking Pipeline Methodology

  The regulatory knowledge base uses a sophisticated, multi-stage processing pipeline 
  specifically designed for Southeast Asian tax and regulatory documents.

  Sources Configuration (sources.yaml):
  - 148 curated regulatory documents from Singapore (IRAS, ACRA) and Malaysia (LHDN, SSM)
  - Rich metadata: country, tax_type, document_version, topics, priority levels
  - URL validation with SHA256 checksums for version control and change detection
  - Processing configuration: 1000-character chunks with 200-character overlap

  Document Download & Validation:
  ```bash
  # Checksum-based version control
  stored_checksum = checksums.get(document_id)
  current_checksum = hashlib.sha256(pdf_content).hexdigest()
  if stored_checksum == current_checksum:
      skip_processing  # Document unchanged since last run
  ```

  Multi-Method PDF Text Extraction:
  1. Primary: pdfplumber - Best for structured government PDFs with tables/columns
  2. Fallback: PyMuPDF - Handles complex layouts when pdfplumber fails
  3. Last Resort: OCR with Tesseract - For scanned PDFs without text layers

  Regulatory-Specific Text Cleaning:
  - Remove page numbers, headers/footers (Page X of Y patterns)
  - Normalize whitespace and quotation marks
  - Remove excessive line breaks
  - Preserve regulatory formatting and legal structure

  Intelligent Sentence-Aware Chunking:
  ```python
  # NOT simple character splitting - uses sentence boundaries
  sentences = sent_tokenize(cleaned_text)  # NLTK sentence detection
  
  for sentence in sentences:
      if len(potential_chunk) > chunk_size and current_chunk:
          # Create chunk at sentence boundary (preserves context)
          create_chunk(current_chunk.strip())
          
          # Intelligent overlap - maintains context across chunks
          overlap_sentences = current_sentences[-overlap_count:]
          start_new_chunk_with_overlap()
  ```

  Rich Metadata Generation:
  - Unique chunk IDs with document version hashing
  - Flattened metadata for efficient filtering (country, tax_type, topics)
  - Processing timestamps and confidence scores
  - Source attribution with original URLs and checksums

  Quality Validation:
  - Minimum chunk length: 100 characters (filters headers/footers)
  - Maximum chunks per document: 500 (prevents runaway processing)
  - Confidence scoring based on extraction method used
  - Language detection (preserved in original for regulatory authority)

  Output: processed_chunks.json
  - 2,168 high-quality regulatory chunks with comprehensive metadata
  - Ready for vector embedding and professional compliance analysis
  - Sentence-boundary preservation maintains regulatory context and meaning

⏺ Summary

  Direct Ingestion Approach:
  - Uses direct Qdrant client connection with proper authentication and API credentials
  - Leverages your configured LiteLLM endpoint with Qwen3-4B embeddings (2560 dimensions)
  - Stores chunks in dedicated regulatory_kb collection with comprehensive metadata
  - Provides complete automation with single-command execution

  Operational Model:
  - Primary Use: One-time knowledge base creation and major updates
  - Frequency: Typically quarterly when regulatory documents are updated
  - Current Status: Automated ingestion ready, simple two-step execution
  - Future Maintenance: Incremental updates when new sources added or regulations change

  Simple Execution Commands:
  ```bash
  cd src/scripts/knowledge_base
  python process.py    # Process regulatory documents into chunks
  python ingest.py     # Automated ingestion to regulatory_kb collection
  ```

  Next Steps:
  1. Complete Initial Ingestion: Execute python ingest.py (all 2,168 chunks)
  2. Update RAG Tool: Modify CrossBorderTaxComplianceTool to use regulatory_kb collection
  3. Production Testing: Verify end-to-end cross-border tax compliance analysis

  The direct ingestion approach provides a clean, automated solution that delivers the curated
  RAG capabilities you requested for professional cross-border tax compliance analysis with
  proper architectural separation between regulatory knowledge and user documents.