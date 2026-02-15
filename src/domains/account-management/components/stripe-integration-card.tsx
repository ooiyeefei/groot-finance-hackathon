'use client'

import { useState } from 'react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import ConfirmationDialog from '@/components/ui/confirmation-dialog'
import { useToast } from '@/components/ui/toast'
import { useActiveBusiness } from '@/contexts/business-context'
import { useStripeConnection, useStripeConnect, useStripeDisconnect } from '@/domains/sales-invoices/hooks/use-stripe-integration'
import { ExternalLink, Info, Loader2, Unplug, Zap } from 'lucide-react'

export default function StripeIntegrationCard() {
  const { businessId } = useActiveBusiness()
  const { connection, isConnected, isLoading } = useStripeConnection()
  const { connect } = useStripeConnect()
  const { disconnect } = useStripeDisconnect()
  const { addToast } = useToast()

  const [apiKey, setApiKey] = useState('')
  const [isConnecting, setIsConnecting] = useState(false)
  const [isDisconnecting, setIsDisconnecting] = useState(false)
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleConnect = async () => {
    if (!businessId || !apiKey.trim()) return
    setError(null)
    setIsConnecting(true)

    try {
      const result = await connect({
        businessId,
        stripeSecretKey: apiKey.trim(),
      })

      addToast({
        type: 'success',
        title: 'Stripe Connected',
        description: `Connected to ${result.accountName}. Syncing your product catalog...`,
      })
      setApiKey('')

      // Auto-sync products immediately after connecting
      fetch('/api/v1/stripe-integration/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId }),
      }).catch(() => {
        // Sync errors are non-blocking — user can retry from Catalog tab
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred')
    } finally {
      setIsConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    if (!businessId) return
    setIsDisconnecting(true)

    try {
      await disconnect({ businessId })
      addToast({
        type: 'success',
        title: 'Stripe Disconnected',
        description: 'Your Stripe account has been disconnected. Synced catalog items are preserved.',
      })
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Disconnect Failed',
        description: err instanceof Error ? err.message : 'Failed to disconnect',
      })
    } finally {
      setIsDisconnecting(false)
      setShowDisconnectConfirm(false)
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-8">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <span className="ml-2 text-muted-foreground">Loading integration status...</span>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10">
              <svg className="h-5 w-5 text-purple-600 dark:text-purple-400" viewBox="0 0 24 24" fill="currentColor">
                <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.591-7.305z" />
              </svg>
            </div>
            <div>
              <CardTitle className="text-lg">Stripe Integration</CardTitle>
              <CardDescription>
                Connect your Stripe account to sync your product catalog
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {isConnected && connection ? (
            // Connected state
            <div className="space-y-4">
              <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/30">
                <div className="h-2.5 w-2.5 rounded-full bg-green-500 animate-pulse" />
                <span className="text-sm font-medium text-green-600 dark:text-green-400">
                  Connected to {connection.stripeAccountName}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Account ID</p>
                  <p className="font-mono text-foreground">{connection.stripeAccountId}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Connected</p>
                  <p className="text-foreground">
                    {connection.connectedAt
                      ? new Date(connection.connectedAt).toLocaleDateString()
                      : 'Unknown'}
                  </p>
                </div>
                {connection.lastSyncAt && (
                  <div className="col-span-2">
                    <p className="text-muted-foreground">Last Synced</p>
                    <p className="text-foreground">
                      {new Date(connection.lastSyncAt).toLocaleString()}
                    </p>
                  </div>
                )}
              </div>

              <Button
                variant="destructive"
                onClick={() => setShowDisconnectConfirm(true)}
                className="w-full sm:w-auto"
              >
                <Unplug className="w-4 h-4 mr-2" />
                Disconnect Stripe
              </Button>
            </div>
          ) : (
            // Disconnected / not connected state
            <div className="space-y-4">
              {connection?.status === 'disconnected' && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-muted border border-border">
                  <div className="h-2.5 w-2.5 rounded-full bg-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    Previously connected — synced catalog items are preserved
                  </span>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="stripe-api-key">Stripe API Key</Label>
                <Input
                  id="stripe-api-key"
                  type="password"
                  placeholder="sk_live_... or rk_live_..."
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value)
                    setError(null)
                  }}
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Use a{' '}
                  <a
                    href="https://docs.stripe.com/keys#create-restricted-api-secret-key"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline inline-flex items-center gap-0.5"
                  >
                    restricted key
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  {' '}(recommended) or a standard secret key from{' '}
                  <span className="font-medium">Stripe Dashboard &gt; Developers &gt; API keys</span>.
                </p>
              </div>

              {/* Required permissions guidance */}
              <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <div className="flex gap-2">
                  <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                  <div className="space-y-1.5">
                    <p className="text-sm font-medium text-blue-600 dark:text-blue-400">
                      Required permissions for restricted keys
                    </p>
                    <ul className="text-xs text-muted-foreground space-y-0.5">
                      <li><span className="font-medium text-foreground">Products</span> — Read</li>
                      <li><span className="font-medium text-foreground">Prices</span> — Read</li>
                      <li><span className="font-medium text-foreground">Connect</span> — Read (for account verification)</li>
                      <li><span className="font-medium text-foreground">Webhook Endpoints</span> — Write (for real-time sync)</li>
                    </ul>
                    <a
                      href="https://docs.stripe.com/api/accounts"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline inline-flex items-center gap-0.5"
                    >
                      Stripe API reference
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              </div>

              {error && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                  <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                </div>
              )}

              <Button
                onClick={handleConnect}
                disabled={isConnecting || !apiKey.trim()}
                className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                {isConnecting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 mr-2" />
                    Connect Stripe
                  </>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmationDialog
        isOpen={showDisconnectConfirm}
        onClose={() => setShowDisconnectConfirm(false)}
        onConfirm={handleDisconnect}
        title="Disconnect Stripe?"
        message="Your synced catalog items will be preserved but no further syncs can be performed until you reconnect."
        confirmText="Disconnect"
        confirmVariant="danger"
        isLoading={isDisconnecting}
      />
    </>
  )
}
