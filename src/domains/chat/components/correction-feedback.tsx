'use client';

import { useState } from 'react';
import { useMutation } from 'convex/react';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _api: any = require('../../../../convex/_generated/api').api;
import { ThumbsDown } from 'lucide-react';

interface CorrectionFeedbackProps {
  messageId?: string;
  conversationId?: string;
  originalQuery: string;
  originalIntent?: string;
  originalToolName?: string;
}

const CORRECTION_TYPES = [
  { value: 'intent', label: 'Wrong classification', description: 'Should have shown my data / was general knowledge' },
  { value: 'tool_selection', label: 'Wrong tool used', description: 'Used the wrong data source' },
  { value: 'parameter_extraction', label: 'Wrong parameters', description: 'Wrong date range, name, or filter' },
] as const;

const INTENT_OPTIONS = [
  { value: 'personal_data', label: 'Should have shown my data' },
  { value: 'general_knowledge', label: 'Should have been general knowledge' },
];

const TOOL_OPTIONS = [
  { value: 'get_invoices', label: 'AP Invoices' },
  { value: 'get_sales_invoices', label: 'Sales Invoices' },
  { value: 'get_transactions', label: 'Transactions' },
  { value: 'get_vendors', label: 'Vendors' },
  { value: 'get_ap_aging', label: 'AP Aging' },
  { value: 'get_ar_summary', label: 'AR Summary' },
  { value: 'analyze_cash_flow', label: 'Cash Flow' },
  { value: 'detect_anomalies', label: 'Anomaly Detection' },
  { value: 'get_employee_expenses', label: 'Employee Expenses' },
  { value: 'get_team_summary', label: 'Team Summary' },
  { value: 'searchRegulatoryKnowledgeBase', label: 'Regulatory Knowledge' },
  { value: 'search_documents', label: 'Document Search' },
];

export function CorrectionFeedback({
  messageId,
  conversationId,
  originalQuery,
  originalIntent,
  originalToolName,
}: CorrectionFeedbackProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [correctionType, setCorrectionType] = useState<string | null>(null);
  const [correctedValue, setCorrectedValue] = useState<string>('');
  const [submitted, setSubmitted] = useState(false);

  const submitCorrection = useMutation(_api.functions.chatCorrections.submit);

  const handleSubmit = async () => {
    if (!correctionType || !correctedValue) return;

    try {
      await submitCorrection({
        messageId,
        conversationId,
        correctionType: correctionType as 'intent' | 'tool_selection' | 'parameter_extraction',
        originalQuery,
        originalIntent: correctionType === 'intent' ? originalIntent : undefined,
        originalToolName: correctionType === 'tool_selection' ? originalToolName : undefined,
        correctedIntent: correctionType === 'intent' ? correctedValue : undefined,
        correctedToolName: correctionType === 'tool_selection' ? correctedValue : undefined,
        correctedParameters: correctionType === 'parameter_extraction' ? correctedValue : undefined,
      });
      setSubmitted(true);
      setTimeout(() => {
        setIsOpen(false);
        setSubmitted(false);
        setCorrectionType(null);
        setCorrectedValue('');
      }, 1500);
    } catch (error) {
      console.error('Failed to submit correction:', error);
    }
  };

  if (submitted) {
    return (
      <span className="text-xs text-muted-foreground ml-2">
        Thanks for the feedback!
      </span>
    );
  }

  return (
    <span className="inline-flex items-center ml-2">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        title="Report incorrect response"
        aria-label="Report incorrect response"
      >
        <ThumbsDown className="h-3.5 w-3.5" />
      </button>

      {isOpen && (
        <span className="ml-2 inline-flex items-center gap-2 text-xs">
          {!correctionType ? (
            <>
              {CORRECTION_TYPES.map((ct) => (
                <button
                  key={ct.value}
                  onClick={() => setCorrectionType(ct.value)}
                  className="px-2 py-1 rounded bg-muted hover:bg-muted/80 text-foreground"
                  title={ct.description}
                >
                  {ct.label}
                </button>
              ))}
            </>
          ) : correctionType === 'intent' ? (
            <>
              {INTENT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    setCorrectedValue(opt.value);
                    // Auto-submit for intent corrections
                    submitCorrection({
                      messageId,
                      conversationId,
                      correctionType: 'intent',
                      originalQuery,
                      originalIntent,
                      correctedIntent: opt.value,
                    }).then(() => {
                      setSubmitted(true);
                      setTimeout(() => {
                        setIsOpen(false);
                        setSubmitted(false);
                        setCorrectionType(null);
                        setCorrectedValue('');
                      }, 1500);
                    });
                  }}
                  className="px-2 py-1 rounded bg-muted hover:bg-muted/80 text-foreground"
                >
                  {opt.label}
                </button>
              ))}
            </>
          ) : correctionType === 'tool_selection' ? (
            <select
              className="px-2 py-1 rounded bg-muted text-foreground text-xs"
              onChange={(e) => {
                setCorrectedValue(e.target.value);
              }}
              defaultValue=""
            >
              <option value="" disabled>Select correct tool...</option>
              {TOOL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              placeholder="Correct parameters..."
              className="px-2 py-1 rounded bg-muted text-foreground text-xs w-48"
              onChange={(e) => setCorrectedValue(e.target.value)}
            />
          )}

          {correctionType && correctionType !== 'intent' && correctedValue && (
            <button
              onClick={handleSubmit}
              className="px-2 py-1 rounded bg-primary text-primary-foreground text-xs"
            >
              Submit
            </button>
          )}

          <button
            onClick={() => {
              setIsOpen(false);
              setCorrectionType(null);
              setCorrectedValue('');
            }}
            className="px-1 py-1 text-muted-foreground hover:text-foreground"
          >
            ×
          </button>
        </span>
      )}
    </span>
  );
}
