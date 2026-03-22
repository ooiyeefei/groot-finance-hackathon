import { ClientProviders } from '@/components/providers/client-providers'
import { PublicDebtorForm } from '@/domains/sales-invoices/components/public-debtor-form'

export const dynamic = 'force-dynamic'

interface DebtorUpdatePageProps {
  params: Promise<{ locale: string; token: string }>
}

export default async function DebtorUpdatePage({ params }: DebtorUpdatePageProps) {
  const { token, locale } = await params

  return (
    <ClientProviders>
      <div className="min-h-screen bg-background">
        {/* Simple header with Groot branding — no sidebar/auth for external debtors */}
        <header className="border-b border-border bg-card px-6 py-4">
          <div className="mx-auto max-w-2xl flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-sm">G</span>
            </div>
            <div>
              <h1 className="text-foreground font-semibold">Groot Finance</h1>
              <p className="text-muted-foreground text-xs">Business Details Update</p>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-2xl px-4 py-8">
          <PublicDebtorForm token={token} locale={locale} />
        </main>

        <footer className="border-t border-border py-6 text-center">
          <p className="text-muted-foreground text-xs">
            Powered by Groot Finance &middot; finance.hellogroot.com
          </p>
        </footer>
      </div>
    </ClientProviders>
  )
}
