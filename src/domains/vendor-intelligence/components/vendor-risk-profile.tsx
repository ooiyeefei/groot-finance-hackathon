"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface VendorRiskProfileProps {
  profile: {
    paymentRiskScore: number;
    concentrationRiskScore: number;
    complianceRiskScore: number;
    priceRiskScore: number;
    riskLevel: "low" | "medium" | "high";
    vendor: { name: string };
  };
}

const RISK_SCORES = [
  {
    key: "paymentRiskScore" as const,
    label: "Payment Risk",
    tooltip: "Based on invoice quality and missing fields",
  },
  {
    key: "concentrationRiskScore" as const,
    label: "Concentration Risk",
    tooltip: "Based on % of total AP spend with this vendor",
  },
  {
    key: "complianceRiskScore" as const,
    label: "Compliance Risk",
    tooltip: "Based on missing TIN or e-invoice compliance",
  },
  {
    key: "priceRiskScore" as const,
    label: "Price Risk",
    tooltip: "Based on price variance over time",
  },
];

const RISK_LEVEL_CONFIG = {
  low: { variant: "success" as const, label: "Low Risk" },
  medium: { variant: "warning" as const, label: "Medium Risk" },
  high: { variant: "error" as const, label: "High Risk" },
};

function RiskBar({ score }: { score: number }) {
  const color =
    score > 70
      ? "bg-destructive"
      : score > 30
        ? "bg-yellow-500"
        : "bg-emerald-500";

  return (
    <div className="w-full h-2 rounded-full bg-muted">
      <div
        className={`h-full rounded-full transition-all ${color}`}
        style={{ width: `${Math.min(score, 100)}%` }}
      />
    </div>
  );
}

export function VendorRiskProfile({ profile }: VendorRiskProfileProps) {
  const levelConfig = RISK_LEVEL_CONFIG[profile.riskLevel];

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base text-foreground">
            Risk Analysis
          </CardTitle>
          <Badge variant={levelConfig.variant}>{levelConfig.label}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {RISK_SCORES.map((risk) => {
            const score = profile[risk.key];
            return (
              <div key={risk.key} className="space-y-1">
                <div className="flex items-center justify-between">
                  <span
                    className="text-xs text-muted-foreground"
                    title={risk.tooltip}
                  >
                    {risk.label}
                  </span>
                  <span className="text-xs font-medium text-foreground">
                    {score}/100
                  </span>
                </div>
                <RiskBar score={score} />
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
