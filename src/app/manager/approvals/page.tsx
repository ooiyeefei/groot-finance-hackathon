/**
 * Manager Approvals Page
 * Dashboard for managers to review and approve expense claims
 */

import ExpenseApprovalDashboard from '@/components/manager/expense-approval-dashboard'

export default function ApprovalsPage() {
  return <ExpenseApprovalDashboard />
}

export const metadata = {
  title: 'Expense Approvals | FinanSEAL',
  description: 'Review and approve employee expense claims'
}