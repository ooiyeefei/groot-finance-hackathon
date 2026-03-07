import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Referral Program - Groot Finance',
  description: 'Refer businesses to Groot Finance and earn referral payouts.',
}

export default function ReferralLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
