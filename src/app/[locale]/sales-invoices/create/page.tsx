// Force dynamic rendering - required for authentication
export const dynamic = 'force-dynamic'

import { InvoiceEditorLayout } from '@/domains/sales-invoices/components/invoice-editor-layout'

export default function CreateSalesInvoicePage() {
  return <InvoiceEditorLayout mode="create" />
}
