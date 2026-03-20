'use client';

import { useState } from 'react';
import { useMutation } from 'convex/react';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _api: any = require('../../../../convex/_generated/api').api;
import { ThumbsUp, ThumbsDown } from 'lucide-react';

interface CorrectionFeedbackProps {
  messageId?: string;
  conversationId?: string;
  originalQuery: string;
  originalIntent?: string;
  originalToolName?: string;
  /** Show "Was this helpful?" label next to thumbs */
  showPromptLabel?: boolean;
}

const CORRECTION_TYPES = [
  { value: 'intent', label: 'Wrong type of data', description: 'Should have shown my data / was general knowledge' },
  { value: 'tool_selection', label: 'Wrong data source', description: 'Used the wrong data source' },
  { value: 'parameter_extraction', label: 'Wrong date, name, or filters', description: 'Wrong date range, name, or filter' },
  { value: 'other', label: 'Other', description: 'Something else was wrong' },
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
  showPromptLabel = false,
}: CorrectionFeedbackProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [correctionType, setCorrectionType] = useState<string | null>(null);
  const [correctedValue, setCorrectedValue] = useState<string>('');
  const [otherText, setOtherText] = useState<string>('');
  const [submitted, setSubmitted] = useState(false);
  const [feedback, setFeedback] = useState<'positive' | 'negative' | null>(null);

  const submitCorrection = useMutation(_api.functions.chatCorrections.submit);

  const handleSubmit = async () => {
    if (!correctionType) return;
    if (correctionType === 'other' && !otherText) return;
    if (correctionType !== 'other' && !correctedValue) return;

    try {
      await submitCorrection({
        messageId,
        conversationId,
        correctionType: correctionType === 'other'
          ? 'parameter_extraction' as const
          : correctionType as 'intent' | 'tool_selection' | 'parameter_extraction',
        originalQuery,
        originalIntent: correctionType === 'intent' ? originalIntent : undefined,
        originalToolName: correctionType === 'tool_selection' ? originalToolName : undefined,
        correctedIntent: correctionType === 'intent' ? correctedValue : undefined,
        correctedToolName: correctionType === 'tool_selection' ? correctedValue : undefined,
        correctedParameters: correctionType === 'other' ? otherText : (correctionType === 'parameter_extraction' ? correctedValue : undefined),
      });
      setSubmitted(true);
      setTimeout(() => {
        setIsOpen(false);
        setSubmitted(false);
        setCorrectionType(null);
        setCorrectedValue('');
        setOtherText('');
      }, 2000);
    } catch (error) {
      console.error('Failed to submit correction:', error);
    }
  };

  if (submitted) {
    return (
      <span className="inline-flex items-center gap-1.5 mt-1.5">
        {feedback === 'positive' ? (
          <>
            <ThumbsUp className="h-4 w-4 text-primary" />
            <span className="text-xs text-muted-foreground">Thanks! Groot is learning</span>
          </>
        ) : (
          <>
            <ThumbsDown className="h-4 w-4 text-destructive" />
            <span className="text-xs text-muted-foreground">Got it — Groot will do better next time</span>
          </>
        )}
      </span>
    );
  }

  return (
    <div className="mt-1.5">
      <span className="group inline-flex items-center gap-0.5 relative">
        {/* Prompt label for every 3rd message */}
        {showPromptLabel && !feedback && (
          <span className="text-xs text-muted-foreground mr-1">Was this helpful?</span>
        )}

        {/* Thumbs up = positive signal (confirms correct intent/tool/params) */}
        <button
          onClick={() => {
            setFeedback('positive');
            submitCorrection({
              messageId,
              conversationId,
              correctionType: 'intent',
              originalQuery,
              originalIntent,
              correctedIntent: originalIntent || 'personal_data',
            }).then(() => {
              setSubmitted(true);
            }).catch(() => {
              setSubmitted(true);
            });
          }}
          className={`p-1.5 rounded-md hover:bg-muted transition-colors ${
            feedback === 'positive' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
          }`}
          title="Good response"
          aria-label="Good response"
        >
          <ThumbsUp className="h-4 w-4" />
        </button>

        {/* Thumbs down = negative signal -> opens correction dropdown */}
        <button
          onClick={() => {
            setFeedback('negative');
            setIsOpen(!isOpen);
          }}
          className={`p-1.5 rounded-md hover:bg-muted transition-colors ${
            feedback === 'negative' ? 'text-destructive' : 'text-muted-foreground hover:text-foreground'
          }`}
          title="Report incorrect response"
          aria-label="Report incorrect response"
        >
          <ThumbsDown className="h-4 w-4" />
        </button>

        {/* Hover tooltip — privacy-conscious messaging */}
        <span className="absolute left-0 top-full mt-1 hidden group-hover:block z-10 w-64 px-3 py-2 rounded-md bg-card border border-border text-xs text-muted-foreground shadow-md pointer-events-none">
          Your feedback helps Groot understand your business better. Improvements stay within your company — never shared with others.
        </span>
      </span>

      {isOpen && (
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs max-w-full overflow-hidden">
          {!correctionType ? (
            <>
              {CORRECTION_TYPES.map((ct) => (
                <button
                  key={ct.value}
                  onClick={() => setCorrectionType(ct.value)}
                  className="px-2.5 py-1.5 rounded-md bg-muted hover:bg-muted/80 text-foreground transition-colors"
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
                        setFeedback(null);
                      }, 2000);
                    });
                  }}
                  className="px-2.5 py-1.5 rounded-md bg-muted hover:bg-muted/80 text-foreground transition-colors"
                >
                  {opt.label}
                </button>
              ))}
            </>
          ) : correctionType === 'tool_selection' ? (
            <select
              className="px-2.5 py-1.5 rounded-md bg-muted text-foreground text-xs"
              onChange={(e) => {
                setCorrectedValue(e.target.value);
              }}
              defaultValue=""
            >
              <option value="" disabled>Select correct source...</option>
              {TOOL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          ) : correctionType === 'other' ? (
            <input
              type="text"
              placeholder="Tell us what went wrong..."
              className="px-2.5 py-1.5 rounded-md bg-muted text-foreground text-xs w-52 max-w-[60%]"
              value={otherText}
              onChange={(e) => setOtherText(e.target.value)}
            />
          ) : (
            <input
              type="text"
              placeholder="What should the correct value be?"
              className="px-2.5 py-1.5 rounded-md bg-muted text-foreground text-xs w-52 max-w-[60%]"
              onChange={(e) => setCorrectedValue(e.target.value)}
            />
          )}

          {correctionType && correctionType !== 'intent' && (
            (correctionType === 'other' ? otherText : correctedValue) ? (
              <button
                onClick={handleSubmit}
                className="px-2.5 py-1.5 rounded-md bg-primary text-primary-foreground text-xs transition-colors hover:bg-primary/90"
              >
                Submit
              </button>
            ) : null
          )}

          <button
            onClick={() => {
              setIsOpen(false);
              setCorrectionType(null);
              setCorrectedValue('');
              setOtherText('');
              setFeedback(null);
            }}
            className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
