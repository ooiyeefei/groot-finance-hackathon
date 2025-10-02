'use client';

import React, { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { SupportedCurrency, CURRENCY_SYMBOLS } from '@/types/transaction';
import { CategoryChartData, DARK_THEME_COLORS } from '../types/analytics';

interface CategoryAnalysisProps {
  categoryData: Record<string, number>;
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

export default function CategoryAnalysis({
  categoryData,
  homeCurrency,
  loading
}: CategoryAnalysisProps) {
  // State to track the index of the hovered bar
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

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
      <div className="bg-gray-800 border border-gray-600 rounded-md px-2 py-1.5 shadow-xl">
        <p className="text-gray-200 font-medium text-sm">{data.name}</p>
        <p className="text-gray-300 font-semibold text-base">
          Amount: {symbol}{data.value.toLocaleString()}
        </p>
        <p className="text-gray-400 text-xs">
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
            onMouseLeave={() => setActiveIndex(null)}
          >
            <defs>
              {chartData.map((entry, index) => (
                <linearGradient id={`category-gradient-${index}`} key={`category-gradient-${index}`} x1="0" y1="1" x2="0" y2="0">
                  <stop offset="0%" stopColor={entry.color} stopOpacity={1} />
                  <stop offset="100%" stopColor={lightenColor(entry.color, 30)} stopOpacity={1} />
                </linearGradient>
              ))}
            </defs>
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
            <Tooltip content={<CustomTooltip />} cursor={false} />
            <Bar 
              dataKey="value" 
              radius={[2, 2, 0, 0]}
              onMouseEnter={(data, index) => setActiveIndex(index)}
            >
              {chartData.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={activeIndex === index ? `url(#category-gradient-${index})` : entry.color}
                  style={{ cursor: 'pointer' }}
                />
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