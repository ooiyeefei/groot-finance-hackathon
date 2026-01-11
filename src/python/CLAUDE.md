Architecture: TypeScript Orchestrator + Python AI Engine

  They are NOT duplicated - they work together in a complementary architecture:

  1. src/trigger/classify-document.ts (TypeScript - Orchestrator)

  Role: Trigger.dev background task that orchestrates the classification workflow

  Responsibilities:
  - Receives classification job from Trigger.dev queue
  - Fetches document from Supabase Storage
  - Creates signed URL for the document
  - Invokes the Python script via python.runScript() (line 125-128)
  - Processes the JSON result returned by Python
  - Updates database with classification results
  - Routes to appropriate extraction task (OCR, IC extraction, payslip extraction)
  - Handles errors and status updates

  Key Code (line 125-128):
  const rawResult = await python.runScript(
    "./src/python/classify_document.py",
    [urlData.signedUrl, expectedDocumentType || "", documentSlot || ""]
  );

  ---
  2. src/python/classify_document.py (Python - AI Engine)

  Role: Standalone Python script that performs AI-powered document classification

  Responsibilities:
  - Accepts CLI arguments (image URL, expected type, slot context)
  - Downloads image from signed URL
  - Uses DSPy + Gemini 3 Flash for multimodal classification
  - Returns structured JSON output with classification results
  - Handles AI errors and confidence scoring

  Key Code (line 203-204):
  classifier = DocumentClassifier()
  result = classifier.classify_document(image_data, expected_type, slot_context)
  print(json.dumps(result, indent=2))  # Returns JSON to TypeScript

  ---
  How They Work Together

  ┌─────────────────────────────────────────────────────────────┐
  │ TypeScript Orchestrator (classify-document.ts)             │
  ├─────────────────────────────────────────────────────────────┤
  │ 1. Receives job from Trigger.dev                           │
  │ 2. Fetches document from Supabase                          │
  │ 3. Creates signed URL                                      │
  │                                                             │
  │ 4. Calls Python script:                                    │
  │    python.runScript("./src/python/classify_document.py")   │
  │                         ↓                                   │
  │         ┌───────────────────────────────────┐             │
  │         │ Python AI Engine                  │             │
  │         │ (classify_document.py)            │             │
  │         ├───────────────────────────────────┤             │
  │         │ • Downloads image                 │             │
  │         │ • Runs DSPy + Gemini 3 Flash    │             │
  │         │ • Returns JSON classification     │             │
  │         └───────────────────────────────────┘             │
  │                         ↓                                   │
  │ 5. Receives JSON result                                    │
  │ 6. Updates database with classification                    │
  │ 7. Routes to extraction task (OCR/IC/Payslip)             │
  └─────────────────────────────────────────────────────────────┘

  ---
  Why This Architecture?

  TypeScript (Node.js) Strengths:

  ✅ Workflow orchestration - Trigger.dev integration, job queuing
  ✅ Database operations - Supabase client, RLS enforcement
  ✅ API integration - Signed URLs, storage access
  ✅ Routing logic - Decision trees, task chaining

  Python Strengths:

  ✅ AI/ML processing - DSPy, Gemini API, PIL image handling
  ✅ Multimodal AI - Image + text processing with LLMs
  ✅ Scientific computing - NumPy, OpenCV (for annotations)

  ---
  Similar Patterns in Codebase

  This pattern is used throughout the codebase:

  1. process-document-ocr.ts (TypeScript) → Python inline code (DSPy extraction)
  2. annotate-document-image.ts (TypeScript) → annotate_image.py (OpenCV drawing)
  3. dspy-receipt-extraction.ts (TypeScript) → Python inline DSPy (expense extraction)

  Pattern: TypeScript orchestrates, Python executes AI/ML workloads

  ---
  Summary

  | Aspect           | classify-document.ts            | classify_document.py            |
  |------------------|---------------------------------|---------------------------------|
  | Language         | TypeScript                      | Python                          |
  | Runtime          | Node.js (Trigger.dev)           | Python (invoked by Trigger.dev) |
  | Role             | Orchestrator                    | AI Engine                       |
  | Invocation       | Trigger.dev job queue           | CLI script called by TypeScript |
  | Responsibilities | Workflow, DB updates, routing   | AI classification only          |
  | Output           | Database updates, task triggers | JSON classification result      |
  | Dependencies     | Supabase, Trigger.dev SDK       | DSPy, Gemini API, PIL           |