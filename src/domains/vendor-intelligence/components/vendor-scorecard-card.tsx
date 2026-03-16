"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DollarSign,
  FileText,
  Clock,
  TrendingUp,
  BrainCircuit,
  AlertTriangle,
} from "lucide-react";
import { formatCurrency, formatNumber } from "@/lib/utils/format-number";

interface VendorScorecardCardProps {
  scorecard: {
    totalSpendYTD: number;
    invoiceVolume: number;
    averagePaymentCycle: number;
    priceStabilityScore: number;
    aiExtractionAccuracy: number;
    anomalyFlagsCount: number;
    vendor: { name: string; category?: string };
  };
}

const METRIC_CONFIG = [
  {
    key: "totalSpendYTD" as const,
    label: "Total Spend YTD",
    icon: DollarSign,
    format: (v: number) => formatCurrency(v, "MYR"),
  },
  {
    key: "invoiceVolume" as const,
    label: "Invoice Volume",
    icon: FileText,
    format: (v: number) => formatNumber(v),
  },
  {
    key: "averagePaymentCycle" as const,
    label: "Avg Payment Cycle",
    icon: Clock,
    format: (v: number) => `${v.toFixed(1)} days`,
  },
  {
    key: "priceStabilityScore" as const,
    label: "Price Stability",
    icon: TrendingUp,
    format: (v: number) => `${v}/100`,
  },
  {
    key: "aiExtractionAccuracy" as const,
    label: "AI Accuracy",
    icon: BrainCircuit,
    format: (v: number) => `${v}%`,
  },
  {
    key: "anomalyFlagsCount" as const,
    label: "Active Anomalies",
    icon: AlertTriangle,
    format: (v: number) => formatNumber(v),
  },
];

export function VendorScorecardCard({ scorecard }: VendorScorecardCardProps) {
  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg text-foreground">
            {scorecard.vendor.name}
          </CardTitle>
          {scorecard.vendor.category && (
            <Badge variant="info" className="text-xs">
              {scorecard.vendor.category}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {METRIC_CONFIG.map((metric) => {
            const Icon = metric.icon;
            const value = scorecard[metric.key];
            const isWarning =
              (metric.key === "anomalyFlagsCount" && value > 0) ||
              (metric.key === "priceStabilityScore" && value < 50) ||
              (metric.key === "aiExtractionAccuracy" && value < 80);

            return (
              <div key={metric.key} className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <Icon
                    className={`w-3.5 h-3.5 ${
                      isWarning
                        ? "text-destructive"
                        : "text-muted-foreground"
                    }`}
                  />
                  <span className="text-xs text-muted-foreground">
                    {metric.label}
                  </span>
                </div>
                <p
                  className={`text-sm font-semibold ${
                    isWarning ? "text-destructive" : "text-foreground"
                  }`}
                >
                  {metric.format(value)}
                </p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
