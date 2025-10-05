import { ParsedInvoiceData, LineItem } from '../types';

export class InvoiceTextParser {
  private static readonly PATTERNS = {
    // Invoice/Document identifiers
    invoiceNumber: /(?:INVOICE|INV|RECEIPT|BILL)\.?\s*(?:NO\.?|NUMBER|#)\s*:?\s*([A-Z0-9\-\/]+)/gi,
    
    // Date patterns (various formats)
    date: /(?:DATE|DATED|ON)\s*:?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|\d{2,4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2})/gi,
    
    // Amount patterns (with various currencies)
    amount: /(?:RM|USD|SGD|MYR|THB|IDR|PHP|EUR|CNY|VND)?\s*[\$]?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/g,
    
    // Company/Vendor patterns
    company: /(?:SDN BHD|PTE LTD|LTD|INC|CORP|CO\.|COMPANY)/gi,
    
    // Contact patterns
    phone: /(?:TEL|PHONE|HP|MOBILE)[\s:]*(\+?[\d\s\-\(\)]{7,})/gi,
    email: /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi,
    
    // Line item patterns (flexible for various formats)
    lineItem: /(\d+\.?\s+)?([A-Z0-9]+\s+)?(.+?)\s+(\d+\.?\d*)\s+([A-Z]+)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)/gi,
    
    // Total patterns
    total: /(?:TOTAL|AMOUNT|GRAND TOTAL|FINAL)\s*:?\s*(?:RM|USD|SGD|MYR)?\s*([\d,]+\.?\d*)/gi,
    subtotal: /(?:SUBTOTAL|SUB TOTAL|SUB-TOTAL)\s*:?\s*(?:RM|USD|SGD|MYR)?\s*([\d,]+\.?\d*)/gi,
    tax: /(?:TAX|GST|VAT|SST)\s*(?:\(\d+%\))?\s*:?\s*(?:RM|USD|SGD|MYR)?\s*([\d,]+\.?\d*)/gi,
  };

  public static parse(rawText: string): ParsedInvoiceData {
    const cleanText = this.cleanText(rawText);
    
    return {
      header: this.parseHeader(cleanText),
      lineItems: this.parseLineItems(cleanText),
      totals: this.parseTotals(cleanText),
      notes: this.parseNotes(cleanText)
    };
  }

  private static cleanText(text: string): string {
    return text
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/([.!?])\s*([A-Z])/g, '$1\n$2'); // Add line breaks after sentences
  }

  private static parseHeader(text: string): ParsedInvoiceData['header'] {
    const header: ParsedInvoiceData['header'] = {};
    
    // Extract invoice number
    const invoiceMatch = text.match(this.PATTERNS.invoiceNumber);
    if (invoiceMatch) {
      header.invoiceNumber = invoiceMatch[0].replace(/^.*?([A-Z0-9\-\/]+)$/i, '$1');
    }
    
    // Extract date
    const dateMatch = text.match(this.PATTERNS.date);
    if (dateMatch) {
      header.date = dateMatch[0].replace(/^.*?(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|\d{2,4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}).*$/i, '$1');
    }
    
    // Extract vendor information
    const lines = text.split('\n').filter(line => line.trim());
    let vendorSection = '';
    const customerSection = '';
    
    // Find vendor (usually first company with SDN BHD, etc.)
    for (let i = 0; i < Math.min(lines.length, 10); i++) {
      if (this.PATTERNS.company.test(lines[i])) {
        vendorSection = lines.slice(Math.max(0, i-2), i+3).join(' ');
        break;
      }
    }
    
    if (vendorSection) {
      header.vendor = this.extractContactInfo(vendorSection);
    }
    
    // Determine document type
    if (/INVOICE/i.test(text)) header.documentType = 'Invoice';
    else if (/RECEIPT/i.test(text)) header.documentType = 'Receipt';
    else if (/BILL/i.test(text)) header.documentType = 'Bill';
    
    return header;
  }

  private static extractContactInfo(section: string) {
    const info: any = {};
    
    // Extract company name (line with SDN BHD, etc.)
    const companyMatch = section.match(/([^\\n]*(?:SDN BHD|PTE LTD|LTD|INC|CORP)[^\\n]*)/i);
    if (companyMatch) {
      info.name = companyMatch[1].trim();
    }
    
    // Extract phone
    const phoneMatch = section.match(this.PATTERNS.phone);
    if (phoneMatch) {
      info.contact = phoneMatch[0];
    }
    
    // Extract email
    const emailMatch = section.match(this.PATTERNS.email);
    if (emailMatch) {
      info.contact = (info.contact || '') + (info.contact ? ', ' : '') + emailMatch[1];
    }
    
    // Extract address (remaining text)
    info.address = section.replace(this.PATTERNS.phone, '').replace(this.PATTERNS.email, '').trim();
    
    return info;
  }

  private static parseLineItems(text: string): LineItem[] {
    const items: LineItem[] = [];
    
    // Look for tabular data patterns
    const lines = text.split('\n');
    let inItemSection = false;
    
    for (const line of lines) {
      // Detect start of items section
      if (/(?:ITEM|DESCRIPTION|QTY|QUANTITY|PRICE|TOTAL)/i.test(line) && 
          /(?:QTY|QUANTITY|PRICE|TOTAL)/i.test(line)) {
        inItemSection = true;
        continue;
      }
      
      // Detect end of items section
      if (inItemSection && (/(?:SUBTOTAL|TOTAL|TAX|AMOUNT|NOTES?)/i.test(line))) {
        break;
      }
      
      if (inItemSection) {
        const item = this.parseLineItem(line);
        if (item) {
          items.push(item);
        }
      }
    }
    
    return items;
  }

  private static parseLineItem(line: string): LineItem | null {
    // Try different line item patterns
    const patterns = [
      // Pattern 1: No. Code Description Qty UOM Price Total
      /(\d+\.?\s+)?([A-Z0-9]+\s+)?(.+?)\s+(\d+\.?\d*)\s+([A-Z]+)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)/i,
      // Pattern 2: Description Qty Price Total
      /(.+?)\s+(\d+\.?\d*)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)/i,
      // Pattern 3: Code Description Total
      /([A-Z0-9]+)\s+(.+?)\s+([\d,]+\.?\d*)/i
    ];
    
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) {
        const item: LineItem = {
          description: '',
          confidence: 0.8
        };
        
        if (pattern === patterns[0] && match.length >= 7) {
          item.itemCode = match[2]?.trim();
          item.description = match[3]?.trim() || '';
          item.quantity = match[4]?.trim();
          item.unitPrice = match[6]?.trim();
          item.total = match[7]?.trim();
        } else if (pattern === patterns[1] && match.length >= 4) {
          item.description = match[1]?.trim() || '';
          item.quantity = match[2]?.trim();
          item.unitPrice = match[3]?.trim();
          item.total = match[4]?.trim();
        } else if (pattern === patterns[2] && match.length >= 3) {
          item.itemCode = match[1]?.trim();
          item.description = match[2]?.trim() || '';
          item.total = match[3]?.trim();
        }
        
        // Only return if we have a meaningful description
        if (item.description && item.description.length > 2) {
          return item;
        }
      }
    }
    
    return null;
  }

  private static parseTotals(text: string): ParsedInvoiceData['totals'] {
    const totals: ParsedInvoiceData['totals'] = {};
    
    // Extract currency
    const currencyMatch = text.match(/(?:^|\s)(RM|USD|SGD|MYR|THB|IDR|PHP|EUR|CNY|VND)(?:\s|$)/i);
    if (currencyMatch) {
      totals.currency = currencyMatch[1].toUpperCase();
    }
    
    // Extract subtotal
    const subtotalMatch = text.match(this.PATTERNS.subtotal);
    if (subtotalMatch) {
      totals.subtotal = subtotalMatch[1];
    }
    
    // Extract tax
    const taxMatch = text.match(this.PATTERNS.tax);
    if (taxMatch) {
      totals.tax = taxMatch[1];
    }
    
    // Extract total (look for the last/largest amount)
    const totalMatches = [...text.matchAll(this.PATTERNS.total)];
    if (totalMatches.length > 0) {
      // Get the largest amount as likely total
      const amounts = totalMatches.map(m => parseFloat(m[1].replace(/,/g, '')));
      const maxAmount = Math.max(...amounts);
      totals.total = maxAmount.toFixed(2);
    }
    
    return totals;
  }

  private static parseNotes(text: string): string[] {
    const notes: string[] = [];
    
    // Look for notes section
    const notesMatch = text.match(/(?:NOTES?|REMARKS?|TERMS?)[:\s]*(.*?)(?:\n\n|$)/i);
    if (notesMatch) {
      const noteText = notesMatch[1].trim();
      if (noteText) {
        // Split by sentence or numbered points
        const splitNotes = noteText.split(/\d+\.\s+|\.\s+(?=[A-Z])/);
        notes.push(...splitNotes.filter(note => note.trim().length > 10));
      }
    }
    
    return notes;
  }

  public static highlightText(text: string, highlights: Record<string, string>): string {
    let highlightedText = text;
    
    // Highlight amounts
    highlightedText = highlightedText.replace(
      /(?:RM|USD|SGD|MYR|THB|IDR|PHP|EUR|CNY|VND)?\s*[\$]?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/g,
      `<span style="color: ${highlights.amounts}; font-weight: 600;">$&</span>`
    );
    
    // Highlight dates
    highlightedText = highlightedText.replace(
      /\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}/g,
      `<span style="color: ${highlights.dates}; font-weight: 600;">$&</span>`
    );
    
    // Highlight identifiers (invoice numbers, etc.)
    highlightedText = highlightedText.replace(
      /(?:I-|INV|RECEIPT)[A-Z0-9\-\/]+/gi,
      `<span style="color: ${highlights.identifiers}; font-weight: 600;">$&</span>`
    );
    
    return highlightedText;
  }
}