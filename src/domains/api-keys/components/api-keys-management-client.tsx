'use client'

import { useState, useCallback, memo } from 'react'
import { useQuery, useMutation } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import { Id } from '../../../../convex/_generated/dataModel'
import { useBusinessContext } from '@/contexts/business-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Key,
  Plus,
  Copy,
  Trash2,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  Shield,
  Loader2,
  Eye,
  EyeOff,
  X
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

// Available MCP tools for permission selection
const AVAILABLE_TOOLS = [
  { id: 'detect_anomalies', name: 'Detect Anomalies', description: 'Find unusual transactions' },
  { id: 'forecast_cash_flow', name: 'Forecast Cash Flow', description: 'Predict future cash flow' },
  { id: 'analyze_vendor_risk', name: 'Analyze Vendor Risk', description: 'Assess vendor concentration risk' },
  { id: 'create_proposal', name: 'Create Proposal', description: 'Create payment proposals (requires approval)' },
  { id: 'confirm_proposal', name: 'Confirm Proposal', description: 'Confirm pending proposals' },
  { id: 'cancel_proposal', name: 'Cancel Proposal', description: 'Cancel pending proposals' },
] as const

type ToolId = typeof AVAILABLE_TOOLS[number]['id']

interface ApiKeyData {
  _id: Id<'mcp_api_keys'>
  keyPrefix: string
  name: string
  permissions: string[]
  rateLimitPerMinute: number
  expiresAt?: number
  lastUsedAt?: number
  createdAt: number
  revokedAt?: number
  isActive: boolean
}

/**
 * Generate a cryptographically secure API key
 */
async function generateApiKey(): Promise<{ raw: string; prefix: string; hash: string }> {
  // Generate 32 random bytes
  const randomBytes = crypto.getRandomValues(new Uint8Array(32))

  // Convert to base64url (URL-safe base64)
  const base64 = btoa(String.fromCharCode(...randomBytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')

  // Create the full key with prefix
  const raw = `fsk_${base64.substring(0, 40)}`
  const prefix = raw.substring(0, 8) // fsk_xxxx

  // Hash using SHA-256 (same as Lambda does for comparison)
  const encoder = new TextEncoder()
  const data = encoder.encode(raw)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

  return { raw, prefix, hash }
}

// Create Key Modal Component
const CreateKeyModal = memo(({
  onClose,
  onKeyCreated
}: {
  onClose: () => void
  onKeyCreated: (rawKey: string) => void
}) => {
  const { activeContext } = useBusinessContext()
  const businessId = activeContext?.businessId
  const [name, setName] = useState('')
  const [selectedTools, setSelectedTools] = useState<Set<ToolId>>(new Set(['detect_anomalies', 'forecast_cash_flow', 'analyze_vendor_risk']))
  const [rateLimit, setRateLimit] = useState(60)
  const [expiration, setExpiration] = useState<'never' | '30' | '90' | '365'>('never')
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generateKeyMutation = useMutation(api.functions.mcpApiKeys.generateApiKey)

  const handleCreate = async () => {
    if (!name.trim()) {
      setError('Please enter a name for the API key')
      return
    }
    if (selectedTools.size === 0) {
      setError('Please select at least one permission')
      return
    }
    if (!businessId) {
      setError('Business context not available')
      return
    }

    setIsCreating(true)
    setError(null)

    try {
      // Generate key client-side
      const { raw, prefix, hash } = await generateApiKey()

      // Calculate expiration
      let expiresAt: number | undefined
      if (expiration !== 'never') {
        const days = parseInt(expiration)
        expiresAt = Date.now() + days * 24 * 60 * 60 * 1000
      }

      // Save to Convex (only hash is stored, createdBy resolved from auth context)
      await generateKeyMutation({
        businessId: businessId as Id<'businesses'>,
        name: name.trim(),
        permissions: Array.from(selectedTools),
        rateLimitPerMinute: rateLimit,
        expiresAt,
        keyHash: hash,
        keyPrefix: prefix,
      })

      // Return the raw key to show once
      onKeyCreated(raw)
    } catch (err) {
      console.error('Failed to create API key:', err)
      setError(err instanceof Error ? err.message : 'Failed to create API key')
      setIsCreating(false)
    }
  }

  const toggleTool = (toolId: ToolId) => {
    const newSelected = new Set(selectedTools)
    if (newSelected.has(toolId)) {
      newSelected.delete(toolId)
    } else {
      newSelected.add(toolId)
    }
    setSelectedTools(newSelected)
  }

  const selectAll = () => {
    setSelectedTools(new Set(AVAILABLE_TOOLS.map(t => t.id)))
  }

  const selectNone = () => {
    setSelectedTools(new Set())
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-card border border-border rounded-lg w-full max-w-lg max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Key className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Create API Key</h2>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 overflow-y-auto max-h-[calc(90vh-140px)]">
          {error && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-md p-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-destructive" />
              <span className="text-sm text-destructive">{error}</span>
            </div>
          )}

          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="key-name">Key Name</Label>
            <Input
              id="key-name"
              placeholder="e.g., Production API Key"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-input border-border"
            />
            <p className="text-xs text-muted-foreground">A descriptive name to identify this key</p>
          </div>

          {/* Permissions */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Permissions</Label>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={selectAll} className="text-xs h-6 px-2">
                  Select All
                </Button>
                <Button variant="ghost" size="sm" onClick={selectNone} className="text-xs h-6 px-2">
                  Clear
                </Button>
              </div>
            </div>
            <div className="space-y-2 bg-muted/50 rounded-md p-3">
              {AVAILABLE_TOOLS.map((tool) => (
                <label
                  key={tool.id}
                  className="flex items-start gap-3 cursor-pointer hover:bg-muted/50 p-2 rounded-md transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selectedTools.has(tool.id)}
                    onChange={() => toggleTool(tool.id)}
                    className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary"
                  />
                  <div>
                    <span className="text-sm font-medium text-foreground">{tool.name}</span>
                    <p className="text-xs text-muted-foreground">{tool.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Rate Limit */}
          <div className="space-y-2">
            <Label htmlFor="rate-limit">Rate Limit</Label>
            <div className="flex items-center gap-2">
              <Input
                id="rate-limit"
                type="number"
                min={1}
                max={1000}
                value={rateLimit}
                onChange={(e) => setRateLimit(Math.max(1, parseInt(e.target.value) || 60))}
                className="bg-input border-border w-24"
              />
              <span className="text-sm text-muted-foreground">requests per minute</span>
            </div>
          </div>

          {/* Expiration */}
          <div className="space-y-2">
            <Label>Expiration</Label>
            <div className="grid grid-cols-4 gap-2">
              {[
                { value: 'never', label: 'Never' },
                { value: '30', label: '30 days' },
                { value: '90', label: '90 days' },
                { value: '365', label: '1 year' },
              ].map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  variant={expiration === option.value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setExpiration(option.value as typeof expiration)}
                  className="text-xs"
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-border">
          <Button variant="outline" onClick={onClose} disabled={isCreating}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={isCreating}>
            {isCreating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Key className="w-4 h-4 mr-2" />
                Create Key
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
})

CreateKeyModal.displayName = 'CreateKeyModal'

// Key Created Success Modal
const KeyCreatedModal = memo(({
  rawKey,
  onClose
}: {
  rawKey: string
  onClose: () => void
}) => {
  const [copied, setCopied] = useState(false)
  const [showKey, setShowKey] = useState(false)

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(rawKey)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      console.error('Failed to copy')
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
    >
      <div className="bg-card border border-border rounded-lg w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center gap-2 p-4 border-b border-border bg-amber-500/10">
          <AlertTriangle className="w-5 h-5 text-amber-500" />
          <h2 className="text-lg font-semibold text-foreground">Save Your API Key</h2>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            This is the only time you will see this key. Please copy and store it securely.
            You will not be able to retrieve it later.
          </p>

          <div className="bg-muted rounded-md p-3 space-y-2">
            <div className="flex items-center gap-2">
              <code className="flex-1 text-sm font-mono text-foreground break-all">
                {showKey ? rawKey : rawKey.substring(0, 8) + '•'.repeat(32)}
              </code>
              <Button variant="ghost" size="sm" onClick={() => setShowKey(!showKey)}>
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={copyToClipboard}
              className="w-full"
            >
              {copied ? (
                <>
                  <CheckCircle className="w-4 h-4 mr-2 text-green-500" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 mr-2" />
                  Copy to Clipboard
                </>
              )}
            </Button>
          </div>

          <div className="bg-amber-500/10 border border-amber-500/30 rounded-md p-3">
            <p className="text-sm text-amber-600 dark:text-amber-400">
              <strong>Security Notice:</strong> Treat this key like a password.
              Do not share it or commit it to version control.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end p-4 border-t border-border">
          <Button onClick={onClose}>
            <CheckCircle className="w-4 h-4 mr-2" />
            I&apos;ve Saved My Key
          </Button>
        </div>
      </div>
    </div>
  )
})

KeyCreatedModal.displayName = 'KeyCreatedModal'

// API Key Row Component
const ApiKeyRow = memo(({
  apiKey,
  onRevoke
}: {
  apiKey: ApiKeyData
  onRevoke: (id: Id<'mcp_api_keys'>) => void
}) => {
  const [isRevoking, setIsRevoking] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const handleRevoke = async () => {
    setIsRevoking(true)
    await onRevoke(apiKey._id)
    setIsRevoking(false)
    setShowConfirm(false)
  }

  return (
    <div className={`bg-muted/30 rounded-lg p-4 border ${apiKey.isActive ? 'border-border' : 'border-destructive/30 opacity-60'}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Key className="w-4 h-4 text-muted-foreground" />
            <span className="font-medium text-foreground truncate">{apiKey.name}</span>
            <Badge variant={apiKey.isActive ? 'default' : 'destructive'} className="text-xs">
              {apiKey.isActive ? 'Active' : 'Revoked'}
            </Badge>
          </div>

          <div className="flex items-center gap-4 text-xs text-muted-foreground mb-2">
            <span className="font-mono bg-muted px-2 py-0.5 rounded">{apiKey.keyPrefix}...</span>
            <span>Rate: {apiKey.rateLimitPerMinute}/min</span>
            {apiKey.expiresAt && (
              <span className={apiKey.expiresAt < Date.now() ? 'text-destructive' : ''}>
                Expires: {new Date(apiKey.expiresAt).toLocaleDateString()}
              </span>
            )}
          </div>

          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Created: {formatDistanceToNow(apiKey.createdAt, { addSuffix: true })}
            </span>
            {apiKey.lastUsedAt && (
              <span className="flex items-center gap-1">
                <CheckCircle className="w-3 h-3 text-green-500" />
                Last used: {formatDistanceToNow(apiKey.lastUsedAt, { addSuffix: true })}
              </span>
            )}
          </div>

          {/* Permissions */}
          <div className="flex flex-wrap gap-1 mt-2">
            {apiKey.permissions.includes('*') ? (
              <Badge variant="secondary" className="text-xs">All Permissions</Badge>
            ) : (
              apiKey.permissions.slice(0, 3).map((perm) => (
                <Badge key={perm} variant="outline" className="text-xs">
                  {perm.replace(/_/g, ' ')}
                </Badge>
              ))
            )}
            {apiKey.permissions.length > 3 && !apiKey.permissions.includes('*') && (
              <Badge variant="outline" className="text-xs">
                +{apiKey.permissions.length - 3} more
              </Badge>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {apiKey.isActive && !showConfirm && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowConfirm(true)}
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
          {showConfirm && (
            <div className="flex items-center gap-2">
              <Button
                variant="destructive"
                size="sm"
                onClick={handleRevoke}
                disabled={isRevoking}
              >
                {isRevoking ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Revoke'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowConfirm(false)}
                disabled={isRevoking}
              >
                Cancel
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
})

ApiKeyRow.displayName = 'ApiKeyRow'

// Main Component
const ApiKeysManagementClient = memo(() => {
  const { activeContext } = useBusinessContext()
  const businessId = activeContext?.businessId
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createdKey, setCreatedKey] = useState<string | null>(null)

  // Fetch API keys for this business
  const apiKeys = useQuery(
    api.functions.mcpApiKeys.listApiKeys,
    businessId ? { businessId: businessId as Id<'businesses'> } : 'skip'
  )

  const revokeMutation = useMutation(api.functions.mcpApiKeys.revokeApiKey)

  const handleRevoke = useCallback(async (apiKeyId: Id<'mcp_api_keys'>) => {
    try {
      await revokeMutation({ apiKeyId })
    } catch (err) {
      console.error('Failed to revoke API key:', err)
    }
  }, [revokeMutation])

  const handleKeyCreated = useCallback((rawKey: string) => {
    setShowCreateModal(false)
    setCreatedKey(rawKey)
  }, [])

  if (!businessId) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">Please select a business to manage API keys.</p>
      </div>
    )
  }

  const activeKeys = apiKeys?.filter(k => k.isActive) || []
  const revokedKeys = apiKeys?.filter(k => !k.isActive) || []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield className="w-5 h-5 text-primary" />
          <div>
            <h3 className="text-lg font-semibold text-foreground">API Keys</h3>
            <p className="text-sm text-muted-foreground">
              Manage API keys for external integrations (Claude Desktop, Zapier, etc.)
            </p>
          </div>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Create API Key
        </Button>
      </div>

      {/* MCP Server Info */}
      <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
        <h4 className="text-[15px] font-medium text-foreground mb-2">MCP Server Endpoint</h4>
        <code className="text-[13px] font-mono text-muted-foreground bg-muted px-2 py-1 rounded block overflow-x-auto">
          https://kuy2a5zca8.execute-api.us-west-2.amazonaws.com/v1/mcp
        </code>
        <p className="text-[13px] text-muted-foreground mt-2">
          Use this endpoint with your API key to connect Claude Desktop, Cursor, or other MCP clients.
        </p>
      </div>

      {/* Loading State */}
      {apiKeys === undefined && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <span className="ml-2 text-muted-foreground">Loading API keys...</span>
        </div>
      )}

      {/* Empty State */}
      {apiKeys !== undefined && apiKeys.length === 0 && (
        <div className="text-center py-12 bg-muted/30 rounded-lg border border-dashed border-border">
          <Key className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">No API Keys Yet</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Create an API key to connect external AI tools to your financial data.
          </p>
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Create Your First API Key
          </Button>
        </div>
      )}

      {/* Active Keys */}
      {activeKeys.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-foreground flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-500" />
            Active Keys ({activeKeys.length})
          </h4>
          {activeKeys.map((key) => (
            <ApiKeyRow key={key._id} apiKey={key} onRevoke={handleRevoke} />
          ))}
        </div>
      )}

      {/* Revoked Keys */}
      {revokedKeys.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <XCircle className="w-4 h-4 text-destructive" />
            Revoked Keys ({revokedKeys.length})
          </h4>
          {revokedKeys.map((key) => (
            <ApiKeyRow key={key._id} apiKey={key} onRevoke={handleRevoke} />
          ))}
        </div>
      )}

      {/* Modals */}
      {showCreateModal && (
        <CreateKeyModal
          onClose={() => setShowCreateModal(false)}
          onKeyCreated={handleKeyCreated}
        />
      )}

      {createdKey && (
        <KeyCreatedModal
          rawKey={createdKey}
          onClose={() => setCreatedKey(null)}
        />
      )}
    </div>
  )
})

ApiKeysManagementClient.displayName = 'ApiKeysManagementClient'

export default ApiKeysManagementClient
