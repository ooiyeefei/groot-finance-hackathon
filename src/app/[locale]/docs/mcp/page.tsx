// Force dynamic rendering - required for authentication
export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowLeft, BookOpen, Key, Shield, Zap, AlertTriangle, ExternalLink } from 'lucide-react'

export const metadata = {
  title: 'MCP Server Documentation - Groot Finance',
  description: 'Documentation for Groot Finance MCP Server - Connect Claude Desktop, Cursor, or any MCP-compatible client to your financial data.',
}

const MCP_ENDPOINT = 'https://kuy2a5zca8.execute-api.us-west-2.amazonaws.com/v1/mcp'

export default function MCPDocsPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-surface border-b border-border sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button asChild variant="ghost" size="sm">
              <Link href="/en/business-settings?tab=api-keys">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to API Keys
              </Link>
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" />
            <span className="font-semibold text-foreground">MCP Documentation</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-6 py-8">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary/10 rounded-full mb-4">
            <Zap className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-3">
            Groot Finance MCP Server
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Financial intelligence tools for AI assistants via the Model Context Protocol.
            Connect Claude Desktop, Cursor, or any MCP-compatible client to your business data.
          </p>
        </div>

        {/* Quick Start Section */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-foreground mb-6 flex items-center gap-2">
            <Zap className="w-6 h-6 text-primary" />
            Quick Start
          </h2>

          <div className="space-y-6">
            {/* Step 1 */}
            <div className="bg-card border border-border rounded-lg p-6">
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-semibold text-sm shrink-0">
                  1
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground mb-2">Get Your API Key</h3>
                  <p className="text-muted-foreground text-sm mb-3">
                    Go to Settings → API Keys in your Groot Finance dashboard, create a new key, and select the tools you want to enable.
                  </p>
                  <Button asChild variant="outline" size="sm">
                    <Link href="/en/business-settings?tab=api-keys">
                      <Key className="w-4 h-4 mr-2" />
                      Manage API Keys
                    </Link>
                  </Button>
                </div>
              </div>
            </div>

            {/* Step 2 */}
            <div className="bg-card border border-border rounded-lg p-6">
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-semibold text-sm shrink-0">
                  2
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground mb-2">Configure Your MCP Client</h3>
                  <p className="text-muted-foreground text-sm mb-3">
                    Add the Groot Finance server to your MCP client configuration.
                  </p>

                  {/* Claude Desktop Config */}
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-foreground mb-2">Claude Desktop</h4>
                    <p className="text-xs text-muted-foreground mb-2">
                      Add to <code className="bg-muted px-1 py-0.5 rounded">~/Library/Application Support/Claude/claude_desktop_config.json</code>
                    </p>
                    <pre className="bg-muted rounded-md p-4 text-sm overflow-x-auto">
                      <code className="text-foreground">{`{
  "mcpServers": {
    "finanseal": {
      "url": "${MCP_ENDPOINT}",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}`}</code>
                    </pre>
                  </div>

                  {/* Cursor Config */}
                  <div>
                    <h4 className="text-sm font-medium text-foreground mb-2">Cursor</h4>
                    <pre className="bg-muted rounded-md p-4 text-sm overflow-x-auto">
                      <code className="text-foreground">{`{
  "mcp": {
    "servers": {
      "finanseal": {
        "type": "http",
        "url": "${MCP_ENDPOINT}",
        "headers": {
          "Authorization": "Bearer YOUR_API_KEY"
        }
      }
    }
  }
}`}</code>
                    </pre>
                  </div>
                </div>
              </div>
            </div>

            {/* Step 3 */}
            <div className="bg-card border border-border rounded-lg p-6">
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-semibold text-sm shrink-0">
                  3
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground mb-2">Test Connection</h3>
                  <pre className="bg-muted rounded-md p-4 text-sm overflow-x-auto">
                    <code className="text-foreground">{`curl -X POST ${MCP_ENDPOINT} \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -d '{"jsonrpc":"2.0","method":"tools/list","id":"1"}'`}</code>
                  </pre>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Available Tools Section */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-foreground mb-6 flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-primary" />
            Available Tools
          </h2>

          {/* Read-Only Tools */}
          <div className="mb-8">
            <h3 className="text-lg font-medium text-foreground mb-4">Read-Only Intelligence Tools</h3>
            <p className="text-muted-foreground text-sm mb-4">
              These tools analyze your financial data without making changes.
            </p>

            <div className="space-y-4">
              <ToolCard
                name="detect_anomalies"
                description="Detect unusual financial transactions using statistical outlier analysis. Returns transactions with spending patterns significantly different from historical norms."
                params={[
                  { name: 'date_range', type: 'object', desc: 'Start/end dates (defaults to last 30 days)' },
                  { name: 'category_filter', type: 'string[]', desc: 'Filter to specific categories' },
                  { name: 'sensitivity', type: 'string', desc: 'low (3σ), medium (2σ), high (1.5σ)' },
                ]}
              />

              <ToolCard
                name="forecast_cash_flow"
                description="Project future cash balance based on historical income/expense patterns. Provides alerts for potential cash flow issues."
                params={[
                  { name: 'horizon_days', type: 'number', desc: '7-90 days forecast (default: 30)' },
                  { name: 'scenario', type: 'string', desc: 'conservative, moderate, optimistic' },
                  { name: 'include_recurring', type: 'boolean', desc: 'Factor in recurring transactions' },
                ]}
              />

              <ToolCard
                name="analyze_vendor_risk"
                description="Analyze vendor concentration, spending changes, and risk factors. Identifies suppliers with high dependency risk."
                params={[
                  { name: 'vendor_filter', type: 'string[]', desc: 'Filter to specific vendors' },
                  { name: 'analysis_period_days', type: 'number', desc: '7-365 days lookback' },
                  { name: 'include_concentration', type: 'boolean', desc: 'Include concentration risk' },
                ]}
              />
            </div>
          </div>

          {/* Proposal Tools */}
          <div>
            <h3 className="text-lg font-medium text-foreground mb-4">Proposal Tools (Human-in-the-Loop)</h3>
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-md p-4 mb-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-sm text-amber-600 dark:text-amber-400">
                  These tools enable AI-assisted write operations with human approval.
                  Proposals expire after 15 minutes to prevent stale approvals.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <ToolCard
                name="create_proposal"
                description="Create a proposal for a write operation that requires human approval. Returns a proposal_id that must be confirmed before the action executes."
                params={[
                  { name: 'action_type', type: 'string', desc: 'approve_expense, reject_expense, categorize_expense, update_vendor' },
                  { name: 'target_id', type: 'string', desc: 'ID of the target entity' },
                  { name: 'summary', type: 'string', desc: 'Human-readable summary (10-500 chars)' },
                ]}
              />

              <ToolCard
                name="confirm_proposal"
                description="Confirm and execute a pending proposal. This is the human approval step that triggers the actual write operation."
                params={[
                  { name: 'proposal_id', type: 'string', desc: 'The proposal ID from create_proposal' },
                ]}
              />

              <ToolCard
                name="cancel_proposal"
                description="Cancel a pending proposal without executing it."
                params={[
                  { name: 'proposal_id', type: 'string', desc: 'The proposal ID to cancel' },
                  { name: 'reason', type: 'string', desc: 'Optional cancellation reason' },
                ]}
              />
            </div>
          </div>
        </section>

        {/* Error Codes Section */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-foreground mb-6 flex items-center gap-2">
            <AlertTriangle className="w-6 h-6 text-primary" />
            Error Codes
          </h2>

          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-3 text-left text-foreground font-medium text-sm">Code</th>
                  <th className="px-4 py-3 text-left text-foreground font-medium text-sm">Description</th>
                  <th className="px-4 py-3 text-left text-foreground font-medium text-sm">Solution</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr>
                  <td className="px-4 py-3 text-sm"><code className="bg-muted px-2 py-0.5 rounded">UNAUTHORIZED</code></td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">Invalid or missing API key</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">Check your API key in Settings</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-sm"><code className="bg-muted px-2 py-0.5 rounded">INVALID_INPUT</code></td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">Request parameters failed validation</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">Check parameter types and required fields</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-sm"><code className="bg-muted px-2 py-0.5 rounded">INSUFFICIENT_DATA</code></td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">Not enough data to complete analysis</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">Expand date range or add more transactions</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-sm"><code className="bg-muted px-2 py-0.5 rounded">RATE_LIMITED</code></td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">Too many requests</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">Wait and retry. Default: 60 req/min</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-sm"><code className="bg-muted px-2 py-0.5 rounded">CONVEX_ERROR</code></td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">Database operation failed</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">Retry or contact support</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-sm"><code className="bg-muted px-2 py-0.5 rounded">INTERNAL_ERROR</code></td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">Unexpected server error</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">Retry or contact support</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Security Section */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-foreground mb-6 flex items-center gap-2">
            <Shield className="w-6 h-6 text-primary" />
            Security
          </h2>

          <div className="bg-card border border-border rounded-lg p-6">
            <ul className="space-y-3">
              <li className="flex items-start gap-3">
                <div className="w-2 h-2 bg-primary rounded-full mt-2 shrink-0" />
                <p className="text-muted-foreground text-sm">
                  <strong className="text-foreground">API keys are hashed</strong> - only the prefix is stored, never the full key
                </p>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-2 h-2 bg-primary rounded-full mt-2 shrink-0" />
                <p className="text-muted-foreground text-sm">
                  <strong className="text-foreground">Business isolation</strong> - each key is scoped to one business
                </p>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-2 h-2 bg-primary rounded-full mt-2 shrink-0" />
                <p className="text-muted-foreground text-sm">
                  <strong className="text-foreground">Permission-based access</strong> - keys can be limited to specific tools
                </p>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-2 h-2 bg-primary rounded-full mt-2 shrink-0" />
                <p className="text-muted-foreground text-sm">
                  <strong className="text-foreground">Expiration support</strong> - set keys to auto-expire after 30, 90, or 365 days
                </p>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-2 h-2 bg-primary rounded-full mt-2 shrink-0" />
                <p className="text-muted-foreground text-sm">
                  <strong className="text-foreground">Audit logging</strong> - all tool calls are logged with timestamps
                </p>
              </li>
            </ul>
          </div>
        </section>

        {/* MCP Protocol Info */}
        <section>
          <h2 className="text-2xl font-semibold text-foreground mb-6">Protocol Details</h2>
          <div className="bg-card border border-border rounded-lg p-6">
            <dl className="space-y-4">
              <div>
                <dt className="text-sm font-medium text-foreground">Endpoint</dt>
                <dd className="text-sm text-muted-foreground mt-1">
                  <code className="bg-muted px-2 py-1 rounded">{MCP_ENDPOINT}</code>
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-foreground">Supported Methods</dt>
                <dd className="text-sm text-muted-foreground mt-1">
                  <code className="bg-muted px-2 py-0.5 rounded mr-2">initialize</code>
                  <code className="bg-muted px-2 py-0.5 rounded mr-2">tools/list</code>
                  <code className="bg-muted px-2 py-0.5 rounded">tools/call</code>
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-foreground">Content-Type</dt>
                <dd className="text-sm text-muted-foreground mt-1">
                  <code className="bg-muted px-2 py-1 rounded">application/json</code>
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-foreground">Authentication</dt>
                <dd className="text-sm text-muted-foreground mt-1">
                  Bearer token in <code className="bg-muted px-2 py-0.5 rounded">Authorization</code> header
                </dd>
              </div>
            </dl>
            <div className="mt-6 pt-6 border-t border-border">
              <a
                href="https://modelcontextprotocol.io"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline text-sm flex items-center gap-1"
              >
                Learn more about MCP
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

// Tool Card Component
function ToolCard({
  name,
  description,
  params
}: {
  name: string
  description: string
  params: { name: string; type: string; desc: string }[]
}) {
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <h4 className="font-mono text-sm font-medium text-primary mb-2">{name}</h4>
      <p className="text-muted-foreground text-sm mb-3">{description}</p>
      <div className="space-y-1">
        {params.map((param) => (
          <div key={param.name} className="flex items-start gap-2 text-xs">
            <code className="bg-muted px-1.5 py-0.5 rounded shrink-0">{param.name}</code>
            <span className="text-muted-foreground/70">{param.type}</span>
            <span className="text-muted-foreground">{param.desc}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
