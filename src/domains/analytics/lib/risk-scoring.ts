/**
 * Dynamic Risk Scoring System for Southeast Asian SME Financial Analytics
 * Based on Otto's recommendations for contextual risk assessment
 */

import { SupportedCurrency } from '@/lib/types/currency';

export interface RiskScoreConfig {
  // Payment terms context
  defaultPaymentTerms: number; // days (Net 15, 30, 60, 90)
  
  // Amount-based scoring weights
  lowAmountThreshold: number;    // Below this = low impact
  highAmountThreshold: number;   // Above this = high impact
  
  // Regional context
  region: 'SEA' | 'ASEAN' | 'Singapore' | 'Malaysia' | 'Thailand' | 'Indonesia' | 'Philippines' | 'Vietnam';
  
  // Business type context
  businessType: 'B2B' | 'B2C' | 'Mixed';
  
  // Risk tolerance
  conservativeScoring: boolean; // More strict risk categorization
}

export interface RiskScore {
  level: 'low' | 'medium' | 'high' | 'critical';
  score: number; // 0-100 normalized score
  factors: string[]; // Contributing risk factors
  recommendation: string;
  color: string; // UI color for display
}

export interface TransactionRiskContext {
  amount: number;
  currency: SupportedCurrency;
  daysPastDue: number;
  transactionType: 'income' | 'expense';
  paymentTerms?: number; // days
  customerVendorHistory?: 'new' | 'established' | 'problematic';
}

// Default risk configuration for Southeast Asian SMEs
export const DEFAULT_RISK_CONFIG: RiskScoreConfig = {
  defaultPaymentTerms: 30, // Standard NET 30 for SMEs
  lowAmountThreshold: 1000,   // Below $1K SGD equivalent = low impact
  highAmountThreshold: 10000, // Above $10K SGD equivalent = high impact
  region: 'SEA',
  businessType: 'Mixed',
  conservativeScoring: false
};

// Currency conversion rates for risk weighting (SGD base)
const CURRENCY_RISK_MULTIPLIERS: Record<SupportedCurrency, number> = {
  'SGD': 1.0,   // Base currency
  'USD': 0.95,  // Stable, slight volatility discount
  'EUR': 0.90,  // Stable, but more volatile
  'MYR': 1.10,  // Regional volatility premium
  'THB': 1.15,  // Higher volatility
  'IDR': 1.25,  // Emerging market premium
  'CNY': 1.20,  // Political/regulatory risk
  'VND': 1.30,  // High volatility premium
  'PHP': 1.25,  // Regional volatility
  'INR': 1.20   // Regional emerging market risk
};

/**
 * Calculate dynamic risk score based on Otto's framework
 */
export function calculateRiskScore(
  context: TransactionRiskContext,
  config: RiskScoreConfig = DEFAULT_RISK_CONFIG
): RiskScore {
  let score = 0;
  const factors: string[] = [];
  
  // 1. Base aging score (40% weight)
  const agingScore = calculateAgingScore(context.daysPastDue, context.paymentTerms || config.defaultPaymentTerms);
  score += agingScore * 0.4;
  
  if (context.daysPastDue > (context.paymentTerms || config.defaultPaymentTerms)) {
    factors.push(`${context.daysPastDue} days past ${context.paymentTerms || config.defaultPaymentTerms}-day terms`);
  }
  
  // 2. Amount impact score (30% weight)
  const amountScore = calculateAmountScore(context.amount, context.currency, config);
  score += amountScore * 0.3;
  
  if (context.amount > config.highAmountThreshold) {
    factors.push(`High-value transaction (${formatCurrency(context.amount, context.currency)})`);
  }
  
  // 3. Currency volatility score (15% weight)
  const currencyScore = calculateCurrencyScore(context.currency);
  score += currencyScore * 0.15;
  
  if (CURRENCY_RISK_MULTIPLIERS[context.currency] > 1.15) {
    factors.push(`High-volatility currency (${context.currency})`);
  }
  
  // 4. Business context score (15% weight)
  const contextScore = calculateBusinessContextScore(context, config);
  score += contextScore * 0.15;
  
  // Normalize score to 0-100
  score = Math.min(100, Math.max(0, score));
  
  // Apply conservative scoring adjustment
  if (config.conservativeScoring) {
    score = Math.min(100, score * 1.2);
    factors.push('Conservative risk assessment applied');
  }
  
  // Determine risk level and recommendations
  const riskLevel = determineRiskLevel(score);
  const recommendation = generateRecommendation(riskLevel, context, factors);
  const color = getRiskColor(riskLevel);
  
  return {
    level: riskLevel,
    score: Math.round(score),
    factors,
    recommendation,
    color
  };
}

/**
 * Calculate aging-based risk score
 */
function calculateAgingScore(daysPastDue: number, paymentTerms: number): number {
  if (daysPastDue <= 0) return 0; // Not overdue
  
  // Progressive scoring based on payment terms
  const termMultiplier = Math.max(1, daysPastDue / paymentTerms);
  
  if (termMultiplier <= 1.0) return 10;   // Within terms
  if (termMultiplier <= 1.5) return 25;   // 1.5x terms
  if (termMultiplier <= 2.0) return 50;   // 2x terms
  if (termMultiplier <= 3.0) return 75;   // 3x terms
  
  return 100; // Beyond 3x payment terms = maximum aging risk
}

/**
 * Calculate amount-based risk score
 */
function calculateAmountScore(amount: number, currency: SupportedCurrency, config: RiskScoreConfig): number {
  // Convert to SGD equivalent for comparison
  const sgdEquivalent = amount / CURRENCY_RISK_MULTIPLIERS[currency];
  
  if (sgdEquivalent < config.lowAmountThreshold) return 5;   // Low impact
  if (sgdEquivalent < config.highAmountThreshold) return 20; // Medium impact
  
  // High-value transactions get progressive scoring
  const ratio = sgdEquivalent / config.highAmountThreshold;
  return Math.min(40, 20 + (ratio * 10));
}

/**
 * Calculate currency volatility risk score
 */
function calculateCurrencyScore(currency: SupportedCurrency): number {
  const multiplier = CURRENCY_RISK_MULTIPLIERS[currency];
  
  if (multiplier <= 1.0) return 0;   // Stable currencies
  if (multiplier <= 1.1) return 10;  // Low volatility
  if (multiplier <= 1.2) return 20;  // Medium volatility
  
  return 30; // High volatility currencies
}

/**
 * Calculate business context risk score
 */
function calculateBusinessContextScore(context: TransactionRiskContext, config: RiskScoreConfig): number {
  let score = 0;
  
  // Transaction type context
  if (context.transactionType === 'income' && context.daysPastDue > 60) {
    score += 15; // Overdue receivables are critical for cash flow
  } else if (context.transactionType === 'expense' && context.daysPastDue > 90) {
    score += 10; // Overdue payables affect supplier relationships
  }
  
  // Customer/vendor history context
  if (context.customerVendorHistory === 'problematic') {
    score += 20;
  } else if (context.customerVendorHistory === 'new') {
    score += 10; // New relationships carry uncertainty
  }
  
  // Regional business environment
  if (config.region === 'SEA' && context.daysPastDue > 45) {
    score += 5; // Regional collection challenges
  }
  
  return Math.min(30, score);
}

/**
 * Determine risk level from numeric score
 */
function determineRiskLevel(score: number): 'low' | 'medium' | 'high' | 'critical' {
  if (score <= 25) return 'low';
  if (score <= 50) return 'medium';
  if (score <= 75) return 'high';
  return 'critical';
}

/**
 * Generate contextual recommendations
 */
function generateRecommendation(
  level: 'low' | 'medium' | 'high' | 'critical',
  context: TransactionRiskContext,
  factors: string[]
): string {
  const isReceivable = context.transactionType === 'income';
  
  switch (level) {
    case 'low':
      return isReceivable 
        ? 'Monitor collection timeline. Standard follow-up procedures.'
        : 'Normal payment schedule. Monitor for early payment discounts.';
        
    case 'medium':
      return isReceivable
        ? 'Proactive follow-up recommended. Consider payment reminders.'
        : 'Schedule payment to maintain supplier relationships.';
        
    case 'high':
      return isReceivable
        ? 'Immediate collection action required. Consider escalation procedures.'
        : 'Priority payment needed. Risk of supplier credit terms impact.';
        
    case 'critical':
      return isReceivable
        ? 'Urgent collection required. Consider legal consultation or write-off assessment.'
        : 'Critical payment overdue. Risk of supply chain disruption.';
        
    default:
      return 'Review transaction status and take appropriate action.';
  }
}

/**
 * Get color coding for risk level
 */
function getRiskColor(level: 'low' | 'medium' | 'high' | 'critical'): string {
  switch (level) {
    case 'low': return '#10B981';      // green-500
    case 'medium': return '#F59E0B';   // amber-500
    case 'high': return '#F97316';     // orange-500
    case 'critical': return '#EF4444'; // red-500
    default: return '#6B7280';         // gray-500
  }
}

/**
 * Format currency for display
 */
function formatCurrency(amount: number, currency: SupportedCurrency): string {
  const symbols: Record<SupportedCurrency, string> = {
    'SGD': 'S$',
    'MYR': 'RM',
    'USD': '$',
    'EUR': '€',
    'THB': '฿',
    'IDR': 'Rp',
    'CNY': '¥',
    'VND': '₫',
    'PHP': '₱',
    'INR': '₹'
  };
  
  const symbol = symbols[currency] || currency;
  
  if (amount >= 1000000) {
    return `${symbol}${(amount / 1000000).toFixed(1)}M`;
  }
  if (amount >= 1000) {
    return `${symbol}${(amount / 1000).toFixed(1)}K`;
  }
  
  return `${symbol}${amount.toLocaleString('en-US', { 
    minimumFractionDigits: 0, 
    maximumFractionDigits: 0 
  })}`;
}

/**
 * Batch calculate risk scores for multiple transactions
 */
export function calculateBatchRiskScores(
  contexts: TransactionRiskContext[],
  config: RiskScoreConfig = DEFAULT_RISK_CONFIG
): RiskScore[] {
  return contexts.map(context => calculateRiskScore(context, config));
}

/**
 * Get risk distribution summary
 */
export function getRiskDistribution(scores: RiskScore[]): {
  low: number;
  medium: number;
  high: number;
  critical: number;
  totalAmount?: number;
  averageScore: number;
} {
  const distribution = {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
    averageScore: 0
  };
  
  if (scores.length === 0) return distribution;
  
  let totalScore = 0;
  
  for (const score of scores) {
    distribution[score.level]++;
    totalScore += score.score;
  }
  
  distribution.averageScore = totalScore / scores.length;
  
  return distribution;
}