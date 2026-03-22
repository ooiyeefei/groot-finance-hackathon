"""
DSPy module for document classification (receipt vs invoice).

Uses ChainOfThought to reason about document content.
The module learns from user corrections via BootstrapFewShot/MIPROv2 optimization.

At inference time, the optimized prompt + few-shot examples are exported as JSON
for the Node.js email processor Lambda to use in Gemini API calls.
"""

import dspy


class ClassifyDocument(dspy.Signature):
    """Classify a financial document as a receipt or invoice based on its visual content description and email context."""

    document_description: str = dspy.InputField(
        desc="AI vision description of the document content (what the image/PDF contains)"
    )
    filename: str = dspy.InputField(
        desc="Original filename of the document attachment"
    )
    email_subject: str = dspy.InputField(
        desc="Subject line of the email that contained this document"
    )
    doc_type: str = dspy.OutputField(
        desc="Document type: 'receipt' (merchant purchase proof for expense claims) or 'invoice' (AP supplier bill requesting payment)"
    )


class DocumentClassifier(dspy.Module):
    """Chain-of-thought document classifier with learned demonstrations."""

    def __init__(self):
        super().__init__()
        self.classify = dspy.ChainOfThought(ClassifyDocument)

    def forward(self, document_description: str, filename: str, email_subject: str) -> dspy.Prediction:
        return self.classify(
            document_description=document_description,
            filename=filename,
            email_subject=email_subject,
        )


def classification_metric(example: dspy.Example, prediction: dspy.Prediction, trace=None) -> float:
    """Metric: does the predicted doc_type match the ground truth?"""
    predicted = getattr(prediction, "doc_type", "").strip().lower()
    expected = getattr(example, "doc_type", "").strip().lower()

    # Normalize common variations
    if predicted in ("receipt", "receipts"):
        predicted = "receipt"
    if predicted in ("invoice", "invoices", "ap invoice", "supplier invoice"):
        predicted = "invoice"
    if expected in ("receipt", "receipts"):
        expected = "receipt"
    if expected in ("invoice", "invoices", "ap invoice", "supplier invoice"):
        expected = "invoice"

    return 1.0 if predicted == expected else 0.0
