'use client';

import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { SupportedCurrency, CURRENCY_SYMBOLS } from '@/types/transaction';
import { CategoryChartData, DARK_THEME_COLORS } from '../types/analytics';

interface CategoryAnalysisProps {
  categoryData: Record<string, number>;
  homeCurrency: SupportedCurrency;
  loading: boolean;
}

export default function CategoryAnalysis({
  categoryData,
  homeCurrency,
  loading
}: CategoryAnalysisProps) {
  const chartData = useMemo(() => {
    if (!categoryData || Object.keys(categoryData).length === 0) {
      return [];
    }

    const total = Object.values(categoryData).reduce((sum, value) => sum + Math.abs(value), 0);
    
    if (total === 0) return [];

    return Object.entries(categoryData)
      .filter(([_, value]) => Math.abs(value) > 0)
      .map(([category, value], index) => ({
        name: formatCategoryName(category),
        category,
        value: Math.abs(value),
        percentage: Math.abs(value) / total * 100,
        color: DARK_THEME_COLORS.categories[index % DARK_THEME_COLORS.categories.length]
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10); // Limit to top 10 categories for readability
  }, [categoryData]);

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
        <h3 className="text-lg font-semibold text-white mb-6">Expense Categories</h3>
        <div className="flex items-center justify-center h-64 text-gray-400">
          <div className="text-center">
            <p className="text-sm">No category data available</p>
            <p className="text-xs mt-1">Record some expenses to see breakdown</p>
          </div>
        </div>
      </div>
    );
  }

  const maxValue = Math.max(...chartData.map(item => item.value));

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload[0]) return null;

    const data = payload[0].payload;
    const symbol = CURRENCY_SYMBOLS[homeCurrency];
    
    return (
      <div className="bg-gray-900 border border-gray-600 rounded-lg p-3 shadow-lg">
        <p className="text-white font-medium">{data.name}</p>
        <p className="text-gray-300 text-sm">
          Amount: {symbol}{data.value.toLocaleString()}
        </p>
        <p className="text-gray-300 text-sm">
          Share: {data.percentage.toFixed(1)}%
        </p>
      </div>
    );
  };

  const formatYAxisTick = (value: number) => {
    const symbol = CURRENCY_SYMBOLS[homeCurrency];
    
    if (value >= 1000000) {
      return `${symbol}${(value / 1000000).toFixed(1)}M`;
    }
    if (value >= 1000) {
      return `${symbol}${(value / 1000).toFixed(1)}K`;
    }
    return `${symbol}${value}`;
  };

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-white">Expense Categories</h3>
        <span className="text-xs text-gray-400">
          Top {chartData.length} {chartData.length === 1 ? 'category' : 'categories'}
        </span>
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{
              top: 20,
              right: 30,
              left: 20,
              bottom: 60,
            }}
          >
            <CartesianGrid 
              strokeDasharray="3 3" 
              stroke={DARK_THEME_COLORS.chart.grid}
              strokeOpacity={0.3}
            />
            <XAxis 
              dataKey="name"
              tick={{ 
                fontSize: 11, 
                fill: DARK_THEME_COLORS.chart.text,
                fontWeight: 400
              }}
              axisLine={{ stroke: DARK_THEME_COLORS.chart.grid }}
              tickLine={{ stroke: DARK_THEME_COLORS.chart.grid }}
              angle={-45}
              textAnchor="end"
              height={60}
              interval={0}
            />
            <YAxis 
              tick={{ 
                fontSize: 11, 
                fill: DARK_THEME_COLORS.chart.text,
                fontWeight: 400
              }}
              axisLine={{ stroke: DARK_THEME_COLORS.chart.grid }}
              tickLine={{ stroke: DARK_THEME_COLORS.chart.grid }}
              tickFormatter={formatYAxisTick}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar 
              dataKey="value" 
              radius={[2, 2, 0, 0]}
              fill={DARK_THEME_COLORS.expense}
            >
              {chartData.map((entry, index) => (
                <Bar key={`bar-${index}`} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Category Summary */}
      <div className="mt-6 pt-4 border-t border-gray-700">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center text-sm">
          <div>
            <p className="text-gray-400 mb-1">Total Categories</p>
            <p className="font-medium text-white">{Object.keys(categoryData).length}</p>
          </div>
          <div>
            <p className="text-gray-400 mb-1">Largest Expense</p>
            <p className="font-medium text-white">{chartData[0]?.name || 'N/A'}</p>
          </div>
          <div>
            <p className="text-gray-400 mb-1">Total Amount</p>
            <p className="font-medium text-white">
              {CURRENCY_SYMBOLS[homeCurrency]}{chartData.reduce((sum, entry) => sum + entry.value, 0).toLocaleString()}
            </p>
          </div>
        </div>

        {/* Top Categories List (Mobile friendly) */}
        <div className="mt-4 sm:hidden">
          <p className="text-xs text-gray-400 mb-2">Top Categories:</p>
          <div className="space-y-1">
            {chartData.slice(0, 5).map((item, index) => (
              <div key={item.category} className="flex items-center justify-between text-xs">
                <div className="flex items-center">
                  <div 
                    className="w-2 h-2 rounded mr-2" 
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-gray-300">{item.name}</span>
                </div>
                <span className="text-white">
                  {CURRENCY_SYMBOLS[homeCurrency]}{item.value.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Format category name for display
 */
function formatCategoryName(category: string): string {
  return category
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}