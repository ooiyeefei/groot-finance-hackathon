#!/usr/bin/env python3
"""
Upload Malaysia MyInvois (LHDN e-invoicing) knowledge base content to Qdrant.

This script creates pre-written document chunks about Malaysia's MyInvois system
and uploads them to the regulatory_kb collection, matching the existing payload
schema used by ingest.py.

Usage:
    cd scripts/knowledge_base
    pip install qdrant-client httpx python-dotenv
    python upload_myinvois.py

Environment variables (from .env.local):
    QDRANT_URL, QDRANT_API_KEY, GEMINI_API_KEY
"""

import json
import asyncio
import os
import sys
import uuid
import time
from pathlib import Path
from typing import List, Dict, Any, Optional

import httpx

# Load environment variables
try:
    from dotenv import load_dotenv
    project_root = Path(__file__).resolve().parent.parent.parent
    # Try chatbot/.env.local first, then groot-finance/.env.local (main working dir)
    env_candidates = [
        project_root / '.env.local',
        project_root.parent / 'groot-finance' / '.env.local',
    ]
    loaded = False
    for env_path in env_candidates:
        if env_path.exists():
            load_dotenv(env_path, verbose=False)
            print(f"Loaded .env.local from {env_path}")
            loaded = True
            break
    if not loaded:
        print(f"Warning: .env.local not found in any expected location")
except ImportError:
    print("Warning: python-dotenv not found, using system environment")

try:
    from qdrant_client import QdrantClient
    from qdrant_client.models import Distance, VectorParams, PointStruct
except ImportError:
    print("Error: qdrant-client not installed. Run: pip install qdrant-client")
    sys.exit(1)


# ---------------------------------------------------------------------------
# MyInvois knowledge chunks — curated content covering the key topics
# ---------------------------------------------------------------------------

MYINVOIS_CHUNKS: List[Dict[str, Any]] = [
    {
        "id": "my_myinvois_overview_001",
        "text": (
            "MyInvois is Malaysia's mandatory e-invoicing system operated by the "
            "Inland Revenue Board of Malaysia (LHDN — Lembaga Hasil Dalam Negeri). "
            "It requires businesses to electronically generate, validate, and store "
            "invoices through LHDN's centralised platform. The system aims to "
            "improve tax compliance, reduce fraud, and create a seamless digital "
            "tax ecosystem. Under MyInvois, every invoice issued between businesses "
            "(B2B) and from businesses to consumers (B2C) must be submitted to LHDN "
            "for real-time validation. Once validated, the invoice receives a unique "
            "Unique Identifier Number (UIN/UUID) from LHDN, confirming it is a "
            "legally recognised e-invoice. Taxpayers can submit e-invoices via the "
            "MyInvois Portal (web-based) or through a direct API integration with "
            "their accounting or ERP systems. The API follows a RESTful design and "
            "uses OAuth 2.0 for authentication. MyInvois supports the Peppol "
            "e-invoice format and is aligned with international e-invoicing "
            "standards. All validated e-invoices are stored by LHDN and accessible "
            "through the MyInvois Portal for both the issuer and the buyer for a "
            "minimum retention period of 7 years."
        ),
        "metadata": {
            "country": "malaysia",
            "tax_type": "e_invoicing",
            "source_name": "MyInvois (LHDN e-Invoicing) — Overview",
            "url": "https://www.hasil.gov.my/e-invois/",
            "document_version": "2025.latest",
            "language": "en",
            "topics": [
                "myinvois", "e_invoicing", "lhdn", "digital_tax",
                "einvoice_overview", "malaysia_compliance"
            ],
        },
        "source_document": {
            "id": "my_myinvois_overview",
            "source_name": "MyInvois (LHDN e-Invoicing) — Overview",
            "url": "https://www.hasil.gov.my/e-invois/",
        },
        "processing_info": {
            "method": "manual_curation",
            "created": "2026-03-19",
            "chunk_index": 1,
        },
    },
    {
        "id": "my_myinvois_compliance_timeline_002",
        "text": (
            "Malaysia's MyInvois e-invoicing mandate is being rolled out in three "
            "phases based on annual turnover or revenue. "
            "Phase 1 (1 August 2024): Mandatory for taxpayers with an annual "
            "turnover or revenue of more than RM100 million. "
            "Phase 2 (1 January 2025): Mandatory for taxpayers with an annual "
            "turnover or revenue of more than RM25 million and up to RM100 million. "
            "Phase 3 (1 July 2025): Mandatory for ALL remaining taxpayers, "
            "regardless of turnover — including micro and small enterprises, sole "
            "proprietors, and individuals conducting business activities. "
            "From the applicable date, affected taxpayers must issue e-invoices for "
            "all transactions, including sales, purchases (self-billed), and "
            "adjustments (credit notes, debit notes). Failure to comply may result "
            "in penalties under the Income Tax Act 1967. LHDN may also disallow "
            "expense deductions for transactions that lack a valid e-invoice. "
            "Businesses should register on the MyInvois Portal, obtain API "
            "credentials if using system integration, and test in the LHDN sandbox "
            "environment before the mandatory go-live date."
        ),
        "metadata": {
            "country": "malaysia",
            "tax_type": "e_invoicing",
            "source_name": "MyInvois — Compliance Timeline & Phases",
            "url": "https://www.hasil.gov.my/e-invois/",
            "document_version": "2025.latest",
            "language": "en",
            "topics": [
                "myinvois", "compliance_timeline", "phase_rollout",
                "mandatory_einvoice", "sme_compliance", "lhdn"
            ],
        },
        "source_document": {
            "id": "my_myinvois_compliance_timeline",
            "source_name": "MyInvois — Compliance Timeline & Phases",
            "url": "https://www.hasil.gov.my/e-invois/",
        },
        "processing_info": {
            "method": "manual_curation",
            "created": "2026-03-19",
            "chunk_index": 2,
        },
    },
    {
        "id": "my_myinvois_how_it_works_003",
        "text": (
            "How MyInvois works — step by step: "
            "1. Invoice Creation: The seller creates an invoice in their accounting "
            "or ERP system (or directly on the MyInvois Portal). The invoice must "
            "include mandatory fields: seller TIN, buyer TIN (for B2B), invoice "
            "number, date and time, line items with description, quantity, unit "
            "price, tax amount, and total. "
            "2. Submission to LHDN: The invoice is submitted to LHDN within 72 "
            "hours of the transaction date (the consolidated e-invoice deadline). "
            "For real-time API integrations, invoices can be submitted immediately. "
            "3. Validation: LHDN validates the e-invoice against business rules — "
            "checking TIN validity, mandatory fields, tax calculations, and format "
            "compliance. Invalid invoices are rejected with error codes. "
            "4. UUID Assignment: Upon successful validation, LHDN assigns a Unique "
            "Identifier Number (UUID) and a QR code to the e-invoice. This UUID is "
            "the legal proof that the invoice has been validated by LHDN. "
            "5. Notification: Both the issuer and the buyer receive notification "
            "that the e-invoice has been validated. The buyer has 72 hours to "
            "reject the e-invoice if there are discrepancies. "
            "6. Storage: Validated e-invoices are stored in the LHDN system for a "
            "minimum of 7 years. Both parties can access them via the MyInvois "
            "Portal. Businesses must also retain their own records. "
            "For B2C transactions, the seller is not required to obtain the buyer's "
            "TIN. Instead, a consolidated e-invoice can be issued monthly."
        ),
        "metadata": {
            "country": "malaysia",
            "tax_type": "e_invoicing",
            "source_name": "MyInvois — How It Works (Submission & Validation Flow)",
            "url": "https://www.hasil.gov.my/e-invois/",
            "document_version": "2025.latest",
            "language": "en",
            "topics": [
                "myinvois", "submission_flow", "validation", "uuid",
                "api_integration", "72_hour_rule", "qr_code"
            ],
        },
        "source_document": {
            "id": "my_myinvois_how_it_works",
            "source_name": "MyInvois — How It Works (Submission & Validation Flow)",
            "url": "https://www.hasil.gov.my/e-invois/",
        },
        "processing_info": {
            "method": "manual_curation",
            "created": "2026-03-19",
            "chunk_index": 3,
        },
    },
    {
        "id": "my_myinvois_document_types_004",
        "text": (
            "MyInvois supports several e-invoice document types that cover the "
            "full lifecycle of commercial transactions in Malaysia: "
            "1. Invoice (Standard e-Invoice): The primary document for recording a "
            "sale of goods or services. Must include all mandatory fields (seller "
            "and buyer TIN, line items, tax, totals). "
            "2. Credit Note: Issued to reduce the amount of a previously issued "
            "e-invoice — for example, when goods are returned, a discount is "
            "applied after the sale, or an overcharge is corrected. Must reference "
            "the original e-invoice UUID. "
            "3. Debit Note: Issued to increase the amount of a previously issued "
            "e-invoice — for example, when additional charges are applied or an "
            "undercharge is corrected. Must reference the original e-invoice UUID. "
            "4. Refund Note (Refund e-Invoice): Issued when a full or partial "
            "refund is made to the buyer. Functions similarly to a credit note but "
            "specifically for refund scenarios. "
            "5. Self-Billed Invoice: Issued by the buyer (instead of the seller) in "
            "specific scenarios permitted by LHDN — such as purchases from "
            "individuals, foreign suppliers, or specific agricultural commodities. "
            "The buyer must have LHDN approval to issue self-billed e-invoices. "
            "6. Self-Billed Credit Note / Debit Note: Adjustments to self-billed "
            "invoices follow the same rules as standard credit/debit notes. "
            "All document types must be submitted through the MyInvois system and "
            "will receive a UUID upon validation."
        ),
        "metadata": {
            "country": "malaysia",
            "tax_type": "e_invoicing",
            "source_name": "MyInvois — Document Types (Invoice, Credit Note, Debit Note, Self-Billed)",
            "url": "https://www.hasil.gov.my/e-invois/",
            "document_version": "2025.latest",
            "language": "en",
            "topics": [
                "myinvois", "document_types", "credit_note", "debit_note",
                "self_billed_invoice", "refund_note", "einvoice_types"
            ],
        },
        "source_document": {
            "id": "my_myinvois_document_types",
            "source_name": "MyInvois — Document Types",
            "url": "https://www.hasil.gov.my/e-invois/",
        },
        "processing_info": {
            "method": "manual_curation",
            "created": "2026-03-19",
            "chunk_index": 4,
        },
    },
    {
        "id": "my_myinvois_penalties_api_005",
        "text": (
            "Penalties and enforcement for MyInvois non-compliance: "
            "Under Section 120 of the Income Tax Act 1967, any person who fails to "
            "comply with the e-invoicing requirements may be liable to a fine of up "
            "to RM50,000 or imprisonment for a term not exceeding 3 years, or both. "
            "LHDN may also disallow expense deductions claimed by a buyer if the "
            "corresponding transaction does not have a valid e-invoice from the "
            "seller. This means businesses that fail to issue e-invoices not only "
            "face direct penalties but also cause compliance problems for their "
            "trading partners. "
            "API integration and technical requirements: "
            "Businesses can integrate directly with the MyInvois API for automated "
            "e-invoice submission. Key technical details: "
            "- Authentication: OAuth 2.0 client credentials flow using client_id "
            "and client_secret obtained from the MyInvois Portal. "
            "- Sandbox environment: LHDN provides a sandbox (preprod) environment "
            "for testing before going live. "
            "- Submission endpoint: POST /api/v1.0/documentsubmissions for batch "
            "submission of e-invoices. "
            "- Document format: JSON payload following the MyInvois schema (based "
            "on Peppol BIS Billing 3.0 / UBL 2.1). "
            "- Validation response: LHDN returns acceptance or rejection within "
            "seconds, with detailed error codes for rejected documents. "
            "- Rate limits: API rate limits apply; batch submissions of up to 100 "
            "documents per call are supported. "
            "- Retrieval: GET endpoints allow fetching validated e-invoices, their "
            "status, and the assigned UUID/QR code. "
            "Record retention: All e-invoices must be retained for a minimum of 7 "
            "years from the date of the transaction, in line with LHDN audit "
            "requirements."
        ),
        "metadata": {
            "country": "malaysia",
            "tax_type": "e_invoicing",
            "source_name": "MyInvois — Penalties, API Integration & Record Retention",
            "url": "https://www.hasil.gov.my/e-invois/",
            "document_version": "2025.latest",
            "language": "en",
            "topics": [
                "myinvois", "penalties", "non_compliance", "api_integration",
                "oauth2", "record_retention", "lhdn_enforcement"
            ],
        },
        "source_document": {
            "id": "my_myinvois_penalties_api",
            "source_name": "MyInvois — Penalties, API Integration & Record Retention",
            "url": "https://www.hasil.gov.my/e-invois/",
        },
        "processing_info": {
            "method": "manual_curation",
            "created": "2026-03-19",
            "chunk_index": 5,
        },
    },
]


def string_to_uuid(text: str) -> str:
    """Convert string to deterministic UUID — same logic as ingest.py."""
    namespace = uuid.UUID('12345678-1234-5678-1234-123456789abc')
    return str(uuid.uuid5(namespace, text))


async def generate_embedding(client: httpx.AsyncClient, text: str, endpoint: str, model: str) -> Optional[List[float]]:
    """Generate embedding via Gemini embedding API (OpenAI-compatible)."""
    for attempt in range(3):
        try:
            resp = await client.post(
                f"{endpoint}/embeddings",
                json={"model": model, "input": text},
            )
            resp.raise_for_status()
            data = resp.json()
            return data["data"][0]["embedding"]
        except Exception as e:
            print(f"  Embedding attempt {attempt+1} failed: {e}")
            if attempt < 2:
                await asyncio.sleep(2 ** attempt)
    return None


async def main():
    # --- Config -----------------------------------------------------------
    qdrant_url = os.getenv("QDRANT_URL")
    qdrant_api_key = os.getenv("QDRANT_API_KEY")
    embedding_api_key = os.getenv("GEMINI_API_KEY") or os.getenv("EMBEDDING_API_KEY")
    embedding_endpoint = "https://generativelanguage.googleapis.com/v1beta/openai"
    embedding_model = "gemini-embedding-001"
    collection_name = "regulatory_kb"

    if not all([qdrant_url, qdrant_api_key, embedding_api_key]):
        print("ERROR: Missing required env vars: QDRANT_URL, QDRANT_API_KEY, GEMINI_API_KEY")
        sys.exit(1)

    print(f"Qdrant URL:   {qdrant_url}")
    print(f"Collection:   {collection_name}")
    print(f"Embedding:    {embedding_model} via {embedding_endpoint}")
    print(f"Chunks to upload: {len(MYINVOIS_CHUNKS)}\n")

    # --- Qdrant client ----------------------------------------------------
    qdrant = QdrantClient(url=qdrant_url, api_key=qdrant_api_key, timeout=60.0)

    # Verify collection exists
    try:
        info = qdrant.get_collection(collection_name)
        vec_size = info.config.params.vectors.size
        print(f"Collection '{collection_name}' exists — vector size {vec_size}, "
              f"points: {info.points_count}")
    except Exception as e:
        print(f"ERROR: Collection '{collection_name}' not found or unreachable: {e}")
        print("Run ingest.py first to create the collection, or verify Qdrant credentials.")
        sys.exit(1)

    # --- Embedding client -------------------------------------------------
    emb_client = httpx.AsyncClient(
        timeout=httpx.Timeout(60.0),
        headers={
            "Authorization": f"Bearer {embedding_api_key}",
            "Content-Type": "application/json",
        },
    )

    # --- Generate embeddings & upload -------------------------------------
    points: List[PointStruct] = []
    start = time.time()

    for i, chunk in enumerate(MYINVOIS_CHUNKS):
        print(f"[{i+1}/{len(MYINVOIS_CHUNKS)}] Embedding chunk: {chunk['id']}")
        embedding = await generate_embedding(
            emb_client, chunk["text"], embedding_endpoint, embedding_model
        )
        if embedding is None:
            print(f"  FAILED to generate embedding — skipping chunk {chunk['id']}")
            continue

        point = PointStruct(
            id=string_to_uuid(chunk["id"]),
            vector=embedding,
            payload={
                "chunk_id": chunk["id"],
                "text": chunk["text"],
                "metadata": chunk["metadata"],
                "source_document": chunk["source_document"],
                "processing_info": chunk["processing_info"],
                # Top-level indexed fields (matching ingest.py pattern)
                "country": chunk["metadata"]["country"],
                "tax_type": chunk["metadata"]["tax_type"],
                "topics": chunk["metadata"]["topics"],
                "document_version": chunk["metadata"]["document_version"],
                "language": chunk["metadata"]["language"],
                "source_name": chunk["metadata"]["source_name"],
            },
        )
        points.append(point)
        # Small delay between API calls
        await asyncio.sleep(0.5)

    await emb_client.aclose()

    if not points:
        print("\nERROR: No embeddings generated. Nothing to upload.")
        sys.exit(1)

    # Upsert to Qdrant
    print(f"\nUploading {len(points)} points to Qdrant collection '{collection_name}'...")
    try:
        qdrant.upsert(collection_name=collection_name, points=points)
        elapsed = time.time() - start
        print(f"\nSUCCESS: Uploaded {len(points)} MyInvois chunks in {elapsed:.1f}s")
        print(f"Point UUIDs:")
        for p in points:
            print(f"  {p.id}")
    except Exception as e:
        print(f"\nERROR: Qdrant upsert failed: {e}")
        sys.exit(1)

    # Verify by reading back count
    try:
        info = qdrant.get_collection(collection_name)
        print(f"\nCollection '{collection_name}' now has {info.points_count} total points.")
    except Exception:
        pass


if __name__ == "__main__":
    asyncio.run(main())
