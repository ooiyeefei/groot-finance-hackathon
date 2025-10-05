export interface ParsedInvoiceData {
  header: {
    documentType?: string;
    invoiceNumber?: string;
    date?: string;
    vendor?: {
      name?: string;
      address?: string;
      contact?: string;
    };
    customer?: {
      name?: string;
      address?: string;
      contact?: string;
    };
  };
  lineItems: LineItem[];
  totals: {
    subtotal?: string;
    tax?: string;
    total?: string;
    currency?: string;
  };
  notes?: string[];
}

export interface LineItem {
  itemCode?: string;
  description: string;
  quantity?: string;
  unitPrice?: string;
  total?: string;
  confidence?: number;
}

export interface OCRTextDisplayProps {
  rawText: string;
  confidence?: number;
  onTextCorrection?: (correctedText: string) => void;
  theme?: 'light' | 'dark';
  highlightKeywords?: string[];
  className?: string;
}

export interface HighlightConfig extends Record<string, string> {
  amounts: string;
  dates: string; 
  identifiers: string;
  vendors: string;
  default: string;
}