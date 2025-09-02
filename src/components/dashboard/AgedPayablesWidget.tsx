'use client';

import React, { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Clock, TrendingDown, AlertTriangle, CreditCard } from 'lucide-react';
import { SupportedCurrency, CURRENCY_SYMBOLS } from '@/types/transaction';
import { AgedPayables, DARK_THEME_COLORS } from './types/analytics';
import { EnhancedAgedPayables } from '@/lib/analytics/engine';

interface AgedPayablesWidgetProps {
  agedPayables: EnhancedAgedPayables;
  homeCurrency: SupportedCurrency;
  loading: boolean;
}

// Helper function to create a lighter version of a hex color for the gradient
const lightenColor = (hex: string, percent: number) => {
  let r = parseInt(hex.substring(1, 3), 16);
  let g = parseInt(hex.substring(3, 5), 16);
  let b = parseInt(hex.substring(5, 7), 16);

  r = Math.min(255, r + (255 - r) * (percent / 100));
  g = Math.min(255, g + (255 - g) * (percent / 100));
  b = Math.min(255, b + (255 - b) * (percent / 100));

  const toHex = (c: number) => ('00' + Math.round(c).toString(16)).slice(-2);

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

export default function AgedPayablesWidget({
  agedPayables,
  homeCurrency,
  loading
}: AgedPayablesWidgetProps) {
  // State to track the index of the hovered bar
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const chartData = useMemo(() => {
    if (!agedPayables) return [];

    // Dynamic risk-based coloring using actual risk distribution data
    const riskColors = {
      low: '#10B981',      // green-500
      medium: '#F59E0B',   // amber-500
      high: '#F97316',     // orange-500
      critical: '#EF4444'  // red-500
    };

    return [
      {
        name: '0-30 days',
        fullName: 'Current (0-30 days)',
        value: agedPayables.current,
        color: riskColors.low,
        risk: 'low'
      },
      {
        name: '31-60 days',
        fullName: '31-60 days',
        value: agedPayables.late_31_60,
        color: riskColors.medium,
        risk: 'medium'
      },
      {
        name: '61-90 days',
        fullName: '61-90 days',
        value: agedPayables.late_61_90,
        color: riskColors.high,
        risk: 'high'
      },
      {
        name: '90+ days',
        fullName: '90+ days',
        value: agedPayables.late_90_plus,
        color: riskColors.critical,
        risk: 'critical'
      }
    ];
  }, [agedPayables]);

  // Calculate max value for chart domain
  const maxValue = Math.max(...chartData.map(d => d.value));

  const formatCurrency = (amount: number) => {
    const symbol = CURRENCY_SYMBOLS[homeCurrency] || homeCurrency;
    
    if (Math.abs(amount) >= 1000000) {
      return `${symbol}${(amount / 1000000).toFixed(1)}M`;
    }
    if (Math.abs(amount) >= 1000) {
      return `${symbol}${(amount / 1000).toFixed(1)}K`;
    }
    
    return `${symbol}${amount.toLocaleString('en-US', { 
      minimumFractionDigits: 0, 
      maximumFractionDigits: 0 
    })}`;
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0];
      const fullName = data.payload.fullName || label;
      return (
        <div className="bg-gray-800 border border-gray-600 rounded-md px-2 py-1.5 shadow-xl">
          <p className="text-gray-200 font-medium text-sm">{fullName}</p>
          <p className="text-red-300 font-semibold text-base">
            {formatCurrency(data.value)}
          </p>
          {data.payload.risk && (
            <p className={`text-xs ${getRiskColor(data.payload.risk)} font-medium`}>
              {data.payload.risk} risk
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'low': return 'text-green-400';
      case 'medium': return 'text-yellow-400';
      case 'high': return 'text-orange-400';
      case 'critical': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  const getRiskIcon = () => {
    const totalOutstanding = agedPayables.total_outstanding;
    const averageRiskScore = agedPayables.average_risk_score;
    const highRiskTransactions = agedPayables.high_risk_transactions;
    
    if (totalOutstanding === 0) return <CreditCard className="w-5 h-5 text-gray-400" />;
    if (averageRiskScore > 75 || highRiskTransactions > 0) return <AlertTriangle className="w-5 h-5 text-red-400" />;
    if (averageRiskScore > 50) return <TrendingDown className="w-5 h-5 text-yellow-400" />;
    return <Clock className="w-5 h-5 text-green-400" />;
  };

  if (loading) {
    return (
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="h-6 bg-gray-700 rounded w-32 animate-pulse"></div>
          <div className="h-5 w-5 bg-gray-700 rounded animate-pulse"></div>
        </div>
        <div className="h-64 bg-gray-700/50 rounded-lg animate-pulse"></div>
      </div>
    );
  }

  const totalOutstanding = agedPayables.total_outstanding;
  const hasPayables = totalOutstanding > 0;

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center">
          {getRiskIcon()}
          <h3 className="text-lg font-semibold text-white ml-2">
            Aged Payables
          </h3>
        </div>
        <div className="text-right">
          <div className="text-sm text-gray-400">Total Outstanding</div>
          <div className="text-lg font-bold text-white">
            {formatCurrency(totalOutstanding)}
          </div>
        </div>
      </div>

      {/* Chart */}
      {hasPayables ? (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
              onMouseLeave={() => setActiveIndex(null)}
            >
              <defs>
                {chartData.map((entry, index) => (
                  <linearGradient id={`payables-gradient-${index}`} key={`payables-gradient-${index}`} x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor={lightenColor(entry.color, 30)} stopOpacity={1} />
                    <stop offset="100%" stopColor={entry.color} stopOpacity={1} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid 
                strokeDasharray="3 3" 
                stroke={DARK_THEME_COLORS.chart.grid}
                horizontal={true}
                vertical={false}
              />
              <XAxis 
                type="number"
                axisLine={false}
                tickLine={false}
                tick={{ fill: DARK_THEME_COLORS.chart.text, fontSize: 12 }}
                tickFormatter={formatCurrency}
                domain={[0, maxValue > 0 ? maxValue : 100]}
                interval={0}
              />
              <YAxis 
                type="category"
                dataKey="name"
                axisLine={false}
                tickLine={false}
                tick={{ fill: DARK_THEME_COLORS.chart.text, fontSize: 12 }}
                width={80}
              />
              <Tooltip content={<CustomTooltip />} cursor={false} />
              <Bar 
                dataKey="value" 
                radius={[0, 4, 4, 0]}
                onMouseEnter={(data, index) => setActiveIndex(index)}
              >
                {chartData.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={activeIndex === index ? `url(#payables-gradient-${index})` : entry.color}
                    style={{ cursor: 'pointer' }}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-64 flex items-center justify-center">
          <div className="text-center text-gray-400">
            <CreditCard className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No outstanding payables</p>
            <p className="text-xs mt-1">All bills are paid or no expense transactions pending</p>
          </div>
        </div>
      )}

      {/* Enhanced Risk Summary */}
      {hasPayables && (
        <div className="mt-6 pt-4 border-t border-gray-700 space-y-4">
          {/* Traditional Summary */}
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <span className="text-gray-400">Current (healthy):</span>
              <span className="ml-2 text-green-400 font-medium">
                {formatCurrency(agedPayables.current)}
              </span>
            </div>
            <div>
              <span className="text-gray-400">At risk (60+ days):</span>
              <span className="ml-2 text-red-400 font-medium">
                {formatCurrency(agedPayables.late_61_90 + agedPayables.late_90_plus)}
              </span>
            </div>
          </div>
          
          {/* Dynamic Risk Insights */}
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <span className="text-gray-400">Avg Risk Score:</span>
              <span className={`ml-2 font-medium ${
                agedPayables.average_risk_score > 75 ? 'text-red-400' :
                agedPayables.average_risk_score > 50 ? 'text-yellow-400' :
                agedPayables.average_risk_score > 25 ? 'text-orange-400' : 'text-green-400'
              }`}>
                {Math.round(agedPayables.average_risk_score)}/100
              </span>
            </div>
            <div>
              <span className="text-gray-400">High-Risk Items:</span>
              <span className="ml-2 text-red-400 font-medium">
                {agedPayables.high_risk_transactions}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}