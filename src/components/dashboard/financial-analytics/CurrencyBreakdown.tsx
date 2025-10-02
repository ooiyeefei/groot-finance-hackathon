'use client';

import React, { useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { SupportedCurrency, CURRENCY_SYMBOLS } from '@/types/transaction';
import { CurrencyChartData, DARK_THEME_COLORS } from '../types/analytics';

interface CurrencyBreakdownProps {
  currencyData: Record<string, number>;
  homeCurrency: SupportedCurrency;
  loading: boolean;
}

export default function CurrencyBreakdown({
  currencyData,
  homeCurrency,
  loading
}: CurrencyBreakdownProps) {
  const chartData = useMemo(() => {
    if (!currencyData || Object.keys(currencyData).length === 0) {
      return [];
    }

    const total = Object.values(currencyData).reduce((sum, value) => sum + Math.abs(value), 0);
    
    if (total === 0) return [];

    return Object.entries(currencyData)
      .filter(([_, value]) => Math.abs(value) > 0)
      .map(([currency, value]) => ({
        name: currency,
        value: Math.abs(value),
        currency: currency as SupportedCurrency,
        percentage: Math.abs(value) / total * 100,
        color: DARK_THEME_COLORS.currencies[currency as keyof typeof DARK_THEME_COLORS.currencies] 
          || DARK_THEME_COLORS.currencies.others,
        displayValue: value // Keep original sign for display
      }))
      .sort((a, b) => b.value - a.value);
  }, [currencyData]);

  if (loading) {
    return (
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
        <div className="h-6 bg-gray-700 rounded w-40 mb-6 animate-pulse"></div>
        <div className="h-64 bg-gray-700 rounded animate-pulse"></div>
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-6">Currency Breakdown</h3>
        <div className="flex items-center justify-center h-64 text-gray-400">
          <div className="text-center">
            <p className="text-sm">No currency data available</p>
            <p className="text-xs mt-1">Complete some transactions to see breakdown</p>
          </div>
        </div>
      </div>
    );
  }

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload[0]) return null;

    const data = payload[0].payload;
    const symbol = CURRENCY_SYMBOLS[data.currency as SupportedCurrency] || data.currency;
    
    return (
      <div className="bg-gray-900 border border-gray-600 rounded-lg p-3 shadow-lg">
        <p className="text-white font-medium">{data.currency}</p>
        <p className="text-gray-300 text-sm">
          Amount: {symbol}{Math.abs(data.displayValue).toLocaleString()}
        </p>
        <p className="text-gray-300 text-sm">
          Share: {data.percentage.toFixed(1)}%
        </p>
        <div className="flex items-center mt-2">
          <div 
            className="w-3 h-3 rounded mr-2" 
            style={{ backgroundColor: data.color }}
          />
          <span className={`text-xs ${data.displayValue >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {data.displayValue >= 0 ? 'Net Positive' : 'Net Negative'}
          </span>
        </div>
      </div>
    );
  };

  const CustomLegend = () => {
    return (
      <div className="flex flex-wrap gap-3 mt-4 justify-center">
        {chartData.map((entry) => {
          const symbol = CURRENCY_SYMBOLS[entry.currency] || entry.currency;
          return (
            <div key={entry.name} className="flex items-center">
              <div 
                className="w-3 h-3 rounded mr-2" 
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-gray-300 text-xs">
                {entry.currency} ({entry.percentage.toFixed(1)}%)
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-white">Currency Breakdown</h3>
        <span className="text-xs text-gray-400">
          {chartData.length} {chartData.length === 1 ? 'currency' : 'currencies'}
        </span>
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={40}
              outerRadius={80}
              paddingAngle={2}
              dataKey="value"
            >
              {chartData.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={entry.color}
                  stroke="#374151"
                  strokeWidth={1}
                />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <CustomLegend />

      {/* Summary Stats */}
      <div className="mt-6 pt-4 border-t border-gray-700">
        <div className="grid grid-cols-2 gap-4 text-center">
          <div>
            <p className="text-xs text-gray-400 mb-1">Home Currency</p>
            <p className="text-sm font-medium text-white">
              {CURRENCY_SYMBOLS[homeCurrency]} {homeCurrency}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1">Total Volume</p>
            <p className="text-sm font-medium text-white">
              {chartData.reduce((sum, entry) => sum + entry.value, 0).toLocaleString()}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}