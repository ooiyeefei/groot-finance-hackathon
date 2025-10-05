-- =====================================================
-- Migration: Create application_documents Table
-- Purpose: Separate applications module from legacy documents table
-- Phase: 4B - Multi-Domain Document Architecture
-- =====================================================

-- Create application_documents table with comprehensive schema
-- This table stores documents specifically for loan applications (IC, payslips, application forms)
-- Matches the structure of invoices table for consistency

CREATE TABLE application_documents (
  -- Identity
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Relationships
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  application_id UUID REFERENCES applications(id) ON DELETE SET NULL,

  -- Document Slot Context (Applications-specific)
  -- Slot types: 'ic', 'payslip_1', 'payslip_2', 'payslip_3', 'application_form'
  document_slot TEXT NOT NULL,
  slot_position INTEGER DEFAULT 1,

  -- File Metadata
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  converted_image_path TEXT,
  converted_image_width INTEGER,
  converted_image_height INTEGER,
  file_size BIGINT NOT NULL,
  file_type TEXT NOT NULL,

  -- Processing State
  processing_status TEXT NOT NULL DEFAULT 'pending',
  document_type TEXT,
  document_classification_confidence FLOAT,
  classification_method TEXT,
  classification_task_id TEXT,
  extraction_task_id TEXT,

  -- Extracted Results (JSONB for flexible schema)
  document_metadata JSONB DEFAULT '{}'::jsonb,
  extracted_data JSONB DEFAULT '{}'::jsonb,
  confidence_score FLOAT,
  error_message TEXT,

  -- Visual Annotations
  annotated_image_path TEXT,

  -- Timestamps
  processing_started_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,

  -- Constraints
  CONSTRAINT application_documents_pkey PRIMARY KEY (id),
  CONSTRAINT valid_processing_status CHECK (processing_status IN (
    'pending',
    'processing',
    'classifying',
    'classification_failed',
    'pending_extraction',
    'extracting',
    'completed',
    'failed'
  )),
  CONSTRAINT valid_document_slot CHECK (document_slot IN (
    'ic',
    'payslip_1',
    'payslip_2',
    'payslip_3',
    'application_form'
  ))
);

-- Indexes for common queries
CREATE INDEX idx_application_documents_application_id ON application_documents(application_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_application_documents_user_id ON application_documents(user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_application_documents_business_id ON application_documents(business_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_application_documents_slot ON application_documents(document_slot) WHERE deleted_at IS NULL;
CREATE INDEX idx_application_documents_status ON application_documents(processing_status) WHERE deleted_at IS NULL;
CREATE INDEX idx_application_documents_deleted ON application_documents(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_application_documents_created_at ON application_documents(created_at DESC);

-- Composite index for slot validation queries
CREATE INDEX idx_application_documents_app_slot ON application_documents(application_id, document_slot) WHERE deleted_at IS NULL;

-- RLS Policies
ALTER TABLE application_documents ENABLE ROW LEVEL SECURITY;

-- Users can view their own application documents
CREATE POLICY "Users can view their own application documents"
  ON application_documents FOR SELECT
  USING (auth.uid()::text = user_id::text);

-- Users can insert their own application documents
CREATE POLICY "Users can insert their own application documents"
  ON application_documents FOR INSERT
  WITH CHECK (auth.uid()::text = user_id::text);

-- Users can update their own application documents
CREATE POLICY "Users can update their own application documents"
  ON application_documents FOR UPDATE
  USING (auth.uid()::text = user_id::text);

-- Users can delete their own application documents (soft delete)
CREATE POLICY "Users can delete their own application documents"
  ON application_documents FOR DELETE
  USING (auth.uid()::text = user_id::text);

-- Service role can manage all application documents (for Trigger.dev jobs)
CREATE POLICY "Service role can manage all application documents"
  ON application_documents FOR ALL
  USING (auth.jwt()->>'role' = 'service_role')
  WITH CHECK (auth.jwt()->>'role' = 'service_role');

-- Add helpful comment
COMMENT ON TABLE application_documents IS 'Documents uploaded for loan applications (IC, payslips, application forms). Part of Phase 4 multi-domain architecture - separate from invoices and expense_claims.';

-- Add column comments for documentation
COMMENT ON COLUMN application_documents.document_slot IS 'Type of document slot: ic, payslip_1, payslip_2, payslip_3, or application_form';
COMMENT ON COLUMN application_documents.slot_position IS 'Position within slot for multi-document slots (e.g., page 1 of multi-page payslip)';
COMMENT ON COLUMN application_documents.converted_image_path IS 'Storage path to converted PNG image (for PDFs). Updated by convert-pdf-to-image Trigger.dev task.';
COMMENT ON COLUMN application_documents.extracted_data IS 'JSONB containing extracted structured data from document (IC info, payslip details, application form data)';
COMMENT ON COLUMN application_documents.annotated_image_path IS 'Storage path to annotated image with bounding boxes drawn on extracted fields';
COMMENT ON COLUMN application_documents.deleted_at IS 'Soft delete timestamp. NULL = active, timestamp = deleted';
