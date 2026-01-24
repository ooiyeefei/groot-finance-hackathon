/**
 * Proactive System Prompt (T051-T056)
 *
 * Templates and utilities for proactive AI assistant behavior:
 * - Mentions pending Action Center insights on conversation start
 * - Connects topics to existing insights
 * - Recalls relevant memories from past conversations
 * - Provides absence summaries for returning users
 */

import type { Memory } from '../memory/mem0-service'

// Types for proactive context
export interface ActionCenterInsight {
  id: string
  title: string
  description: string
  category: 'anomaly' | 'compliance' | 'deadline' | 'cashflow' | 'optimization'
  priority: 'critical' | 'high' | 'medium' | 'low'
  status: 'new' | 'reviewed' | 'dismissed' | 'actioned'
  createdAt: Date
  metadata?: Record<string, unknown>
}

export interface ProactiveContext {
  pendingInsights: ActionCenterInsight[]
  relevantMemories: Memory[]
  lastActiveDate?: Date
  daysSinceLastActive?: number
  currentTopic?: string
}

// Priority labels for user-friendly display
const PRIORITY_LABELS: Record<string, string> = {
  critical: 'requires immediate attention',
  high: 'should be addressed soon',
  medium: 'worth reviewing',
  low: 'for your information'
}

// Category icons/labels
const CATEGORY_LABELS: Record<string, string> = {
  anomaly: 'unusual activity',
  compliance: 'compliance matter',
  deadline: 'upcoming deadline',
  cashflow: 'cash flow insight',
  optimization: 'optimization opportunity'
}

/**
 * T051: Base proactive system prompt template
 */
export function buildProactiveSystemPrompt(context: ProactiveContext): string {
  const sections: string[] = []

  // Standard behavior instructions
  sections.push(`
You are FinanSEAL's proactive AI financial assistant. Beyond answering questions, you actively help users stay informed about their financial health.

## Proactive Behavior Guidelines

1. **Be Genuinely Helpful**: Mention relevant insights naturally, not as a checklist
2. **Context-Aware**: Connect current conversation topics to relevant insights or past discussions
3. **Non-Intrusive**: Introduce insights organically; don't interrupt focused conversations
4. **Action-Oriented**: Suggest specific next steps when mentioning issues
`.trim())

  // T052: Inject pending Action Center insights
  if (context.pendingInsights.length > 0) {
    const insightSection = buildInsightSection(context.pendingInsights)
    sections.push(insightSection)
  }

  // T055: Memory recall context
  if (context.relevantMemories.length > 0) {
    const memorySection = buildMemorySection(context.relevantMemories)
    sections.push(memorySection)
  }

  // T056: Absence summary for returning users
  if (context.daysSinceLastActive && context.daysSinceLastActive >= 7) {
    const absenceSection = buildAbsenceSection(context.daysSinceLastActive, context.pendingInsights)
    sections.push(absenceSection)
  }

  return sections.join('\n\n')
}

/**
 * T052 & T053: Build insight injection section
 * Prioritizes critical and high-priority items
 */
function buildInsightSection(insights: ActionCenterInsight[]): string {
  // Sort by priority (critical > high > medium > low)
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 }
  const sorted = [...insights].sort((a, b) =>
    priorityOrder[a.priority] - priorityOrder[b.priority]
  )

  // Take top 5 most important
  const top = sorted.slice(0, 5)

  const lines: string[] = [
    '## Pending Action Center Items',
    '',
    'The following items need user attention. Mention them naturally when relevant:'
  ]

  for (const insight of top) {
    const priorityLabel = PRIORITY_LABELS[insight.priority]
    const categoryLabel = CATEGORY_LABELS[insight.category]
    lines.push(`- **${insight.title}** (${categoryLabel}, ${priorityLabel}): ${insight.description.slice(0, 150)}`)
  }

  if (insights.length > 5) {
    lines.push(`- ... and ${insights.length - 5} more items in the Action Center`)
  }

  return lines.join('\n')
}

/**
 * T055: Build memory recall section
 */
function buildMemorySection(memories: Memory[]): string {
  const lines: string[] = [
    '## User Context from Past Conversations',
    '',
    'Remember these facts about the user (use naturally in conversation):'
  ]

  for (const memory of memories.slice(0, 8)) {
    const category = (memory.metadata?.category as string) || 'context'
    lines.push(`- [${category}] ${memory.memory}`)
  }

  return lines.join('\n')
}

/**
 * T056: Build absence summary for returning users
 */
function buildAbsenceSection(daysSinceLastActive: number, insights: ActionCenterInsight[]): string {
  const lines: string[] = [
    '## Welcome Back Summary',
    '',
    `The user has been away for ${daysSinceLastActive} days. Provide a brief summary of what happened while they were away.`
  ]

  // Count insights by category
  const categoryCounts = new Map<string, number>()
  for (const insight of insights) {
    categoryCounts.set(insight.category, (categoryCounts.get(insight.category) || 0) + 1)
  }

  if (categoryCounts.size > 0) {
    lines.push('')
    lines.push('Key developments during absence:')
    for (const [category, count] of categoryCounts.entries()) {
      lines.push(`- ${count} new ${CATEGORY_LABELS[category] || category} alert${count > 1 ? 's' : ''}`)
    }
  }

  // Count critical items
  const criticalCount = insights.filter(i => i.priority === 'critical').length
  if (criticalCount > 0) {
    lines.push('')
    lines.push(`⚠️ There are ${criticalCount} CRITICAL items requiring immediate attention.`)
  }

  return lines.join('\n')
}

/**
 * T053: Generate conversation opener based on pending insights
 * Use this when starting a new conversation
 */
export function generateConversationOpener(context: ProactiveContext): string | null {
  // Only generate opener if there are unreviewed high-priority items
  const urgentInsights = context.pendingInsights.filter(i =>
    i.status === 'new' && (i.priority === 'critical' || i.priority === 'high')
  )

  if (urgentInsights.length === 0) {
    return null // No urgent items, use standard greeting
  }

  // Handle returning users differently
  if (context.daysSinceLastActive && context.daysSinceLastActive >= 7) {
    const days = context.daysSinceLastActive
    const criticalCount = urgentInsights.filter(i => i.priority === 'critical').length

    if (criticalCount > 0) {
      return `Welcome back! It's been ${days} days since your last visit. I noticed ${criticalCount} critical item${criticalCount > 1 ? 's' : ''} that need${criticalCount === 1 ? 's' : ''} your attention. Would you like me to summarize what's happened while you were away?`
    }

    return `Welcome back! It's been ${days} days. I have ${urgentInsights.length} update${urgentInsights.length > 1 ? 's' : ''} that might interest you. Shall I give you a quick rundown?`
  }

  // Regular session with urgent items
  if (urgentInsights.length === 1) {
    const insight = urgentInsights[0]
    return `Hello! Just a heads up - I noticed a ${CATEGORY_LABELS[insight.category]} that ${PRIORITY_LABELS[insight.priority]}: "${insight.title}". Would you like to discuss it, or is there something else I can help you with?`
  }

  return `Hello! I have ${urgentInsights.length} items that may need your attention. Would you like me to go through them, or shall we focus on something else?`
}

/**
 * T054: Generate topic-to-insight connection
 * Call this when user mentions a related topic
 */
export function generateTopicConnection(
  currentTopic: string,
  insights: ActionCenterInsight[]
): string | null {
  // Map topics to insight categories
  const topicToCategory: Record<string, string[]> = {
    expense: ['anomaly', 'optimization'],
    spending: ['anomaly', 'cashflow'],
    invoice: ['deadline', 'compliance'],
    vendor: ['optimization', 'anomaly'],
    tax: ['deadline', 'compliance'],
    payment: ['cashflow', 'deadline'],
    cash: ['cashflow', 'optimization'],
    budget: ['optimization', 'anomaly']
  }

  // Find matching category
  const lowerTopic = currentTopic.toLowerCase()
  let matchedCategories: string[] = []

  for (const [keyword, categories] of Object.entries(topicToCategory)) {
    if (lowerTopic.includes(keyword)) {
      matchedCategories = [...matchedCategories, ...categories]
    }
  }

  if (matchedCategories.length === 0) {
    return null
  }

  // Find related insights
  const relatedInsights = insights.filter(i =>
    matchedCategories.includes(i.category) && i.status === 'new'
  )

  if (relatedInsights.length === 0) {
    return null
  }

  // Generate natural connection
  const insight = relatedInsights[0]
  const transitions = [
    `Speaking of ${lowerTopic}, I detected`,
    `While we're discussing ${lowerTopic}, you might want to know about`,
    `This relates to something I noticed:`,
    `Interestingly, regarding ${lowerTopic},`
  ]

  const transition = transitions[Math.floor(Math.random() * transitions.length)]
  return `${transition} ${insight.description}`
}

/**
 * T055: Generate memory recall connection
 * Use when past discussion is relevant to current topic
 */
export function generateMemoryConnection(
  currentTopic: string,
  memories: Memory[]
): string | null {
  // Search for relevant memories
  const lowerTopic = currentTopic.toLowerCase()
  const relevantMemories = memories.filter(m => {
    const memoryText = m.memory.toLowerCase()
    return memoryText.includes(lowerTopic) ||
           lowerTopic.split(' ').some(word => word.length > 3 && memoryText.includes(word))
  })

  if (relevantMemories.length === 0) {
    return null
  }

  const memory = relevantMemories[0]
  const dateStr = memory.created_at
    ? formatRelativeDate(new Date(memory.created_at))
    : 'previously'

  return `I remember ${dateStr} you mentioned: "${memory.memory}". Is this still relevant to our current discussion?`
}

// Helper to format relative dates
function formatRelativeDate(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'today'
  if (diffDays === 1) return 'yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffDays < 14) return 'about a week ago'
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
  if (diffDays < 60) return 'about a month ago'
  return `${Math.floor(diffDays / 30)} months ago`
}
