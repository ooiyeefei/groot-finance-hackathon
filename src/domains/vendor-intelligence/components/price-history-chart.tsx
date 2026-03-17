"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { formatCurrency } from "@/lib/utils/format-number";
import { formatBusinessDate } from "@/lib/utils";

interface PriceTrendDataPoint {
  date: string;
  unitPrice: number;
  currency: string;
}

interface PriceHistoryChartProps {
  dataPoints: PriceTrendDataPoint[];
  currency?: string;
  unitWarning?: string;
}

export function PriceHistoryChart({
  dataPoints,
  currency = "MYR",
  unitWarning,
}: PriceHistoryChartProps) {
  if (dataPoints.length === 0) {
    return (
      <div className="flex items-center justify-center h-[300px] text-sm text-muted-foreground">
        No price data available
      </div>
    );
  }

  const formattedData = dataPoints.map((dp) => ({
    ...dp,
    formattedDate: formatBusinessDate(dp.date),
  }));

  return (
    <div>
      {unitWarning && (
        <p className="text-xs text-yellow-600 mb-2 px-1">{unitWarning}</p>
      )}
    <ResponsiveContainer width="100%" height={300}>
      <LineChart
        data={formattedData}
        margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          className="stroke-border"
          opacity={0.3}
        />
        <XAxis
          dataKey="formattedDate"
          tick={{ fontSize: 11 }}
          className="fill-muted-foreground"
        />
        <YAxis
          tick={{ fontSize: 11 }}
          className="fill-muted-foreground"
          tickFormatter={(v) => formatCurrency(v, currency)}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "6px",
            color: "hsl(var(--foreground))",
          }}
          formatter={(value: number) => [
            formatCurrency(value, currency),
            "Unit Price",
          ]}
          labelFormatter={(label) => `Date: ${label}`}
        />
        <Line
          type="monotone"
          dataKey="unitPrice"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          dot={{ fill: "hsl(var(--primary))", r: 4 }}
          activeDot={{ r: 6 }}
        />
      </LineChart>
    </ResponsiveContainer>
    </div>
  );
}
