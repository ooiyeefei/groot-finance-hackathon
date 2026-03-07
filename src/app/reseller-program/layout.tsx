import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Reseller Program - Groot Finance',
  description: 'Grow recurring revenue with the Groot Finance reseller program.',
}

export default function ResellerProgramLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
