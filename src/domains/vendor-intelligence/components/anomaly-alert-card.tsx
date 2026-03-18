"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  TrendingUp,
  PackagePlus,
  Clock,
  Eye,
  X,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils/format-number";
import { formatBusinessDate } from "@/lib/utils";
import type { AlertType, SeverityLevel } from "../types";
import { Id } from "../../../../convex/_generated/dataModel";
import { useState } from "react";

interface RecommendedAction {
  _id: Id<"vendor_recommended_actions">;
  actionType: string;
  actionDescription: string;
  priorityLevel: string;
  status: string;
}

interface AnomalyAlertCardProps {
  alert: {
    _id: Id<"vendor_price_anomalies">;
    alertType: AlertType;
    severityLevel: SeverityLevel;
    oldValue: number;
    newValue: number;
    percentageChange: number;
    itemIdentifier?: string | null;
    createdTimestamp: number;
    status: string;
    vendor: { name: string; category?: string };
  };
  onDismiss: (alertId: Id<"vendor_price_anomalies">, feedback?: string) => void;
  onViewHistory?: () => void;
  recommendedActions?: RecommendedAction[];
  onCompleteAction?: (actionId: Id<"vendor_recommended_actions">) => void;
  onDismissAction?: (actionId: Id<"vendor_recommended_actions">) => void;
}

const ALERT_TYPE_CONFIG: Record<
  AlertType,
  { icon: typeof AlertTriangle; label: string }
> = {
  "per-invoice": { icon: TrendingUp, label: "Price Increase" },
  "trailing-average": { icon: AlertTriangle, label: "Trailing Average Spike" },
  "new-item": { icon: PackagePlus, label: "New Charge Detected" },
  "frequency-change": { icon: Clock, label: "Billing Pattern Changed" },
};

/**
 * T022: Display single anomaly alert with vendor info, prices, and actions.
 */
export function AnomalyAlertCard({
  alert,
  onDismiss,
  onViewHistory,
  recommendedActions,
  onCompleteAction,
  onDismissAction,
}: AnomalyAlertCardProps) {
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedback, setFeedback] = useState("");

  const config = ALERT_TYPE_CONFIG[alert.alertType];
  const Icon = config.icon;
  const isHighImpact = alert.severityLevel === "high-impact";

  const handleDismiss = () => {
    if (showFeedback && feedback.trim()) {
      onDismiss(alert._id, feedback.trim());
    } else if (!showFeedback) {
      setShowFeedback(true);
      return;
    } else {
      onDismiss(alert._id);
    }
    setShowFeedback(false);
    setFeedback("");
  };

  return (
    <Card className="bg-card border-border">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div
              className={`p-2 rounded-lg shrink-0 ${
                isHighImpact
                  ? "bg-destructive/10 text-destructive"
                  : "bg-warning/10 text-warning"
              }`}
            >
              <Icon className="w-4 h-4" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-foreground truncate">
                  {alert.vendor.name}
                </span>
                <Badge
                  variant={isHighImpact ? "error" : "warning"}
                  className="text-xs"
                >
                  {isHighImpact ? "High Impact" : "Standard"}
                </Badge>
                <Badge variant="info" className="text-xs">
                  {config.label}
                </Badge>
              </div>

              {alert.itemIdentifier && (
                <p className="text-sm text-muted-foreground mt-1 truncate">
                  Item: {alert.itemIdentifier}
                </p>
              )}

              <div className="flex items-center gap-4 mt-2 text-sm">
                {alert.alertType !== "new-item" && (
                  <>
                    <span className="text-muted-foreground">
                      Previous: {formatCurrency(alert.oldValue, "MYR")}
                    </span>
                    <span className="text-foreground font-medium">
                      Current: {formatCurrency(alert.newValue, "MYR")}
                    </span>
                  </>
                )}
                {alert.alertType === "new-item" && (
                  <span className="text-foreground font-medium">
                    New charge: {formatCurrency(alert.newValue, "MYR")}
                  </span>
                )}
                <span
                  className={`font-semibold ${
                    alert.percentageChange > 0
                      ? "text-destructive"
                      : "text-emerald-500"
                  }`}
                >
                  {alert.percentageChange > 0 ? "+" : ""}
                  {alert.percentageChange.toFixed(1)}%
                </span>
              </div>

              <p className="text-xs text-muted-foreground mt-1">
                Detected {formatBusinessDate(alert.createdTimestamp)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {onViewHistory && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onViewHistory}
                title="View History"
              >
                <Eye className="w-4 h-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDismiss}
              title="Dismiss"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* T068: Recommended Actions */}
        {recommendedActions && recommendedActions.length > 0 && (
          <div className="mt-3 border-t border-border pt-3">
            <p className="text-xs font-medium text-muted-foreground mb-2">Recommended Actions</p>
            <div className="space-y-1.5">
              {recommendedActions.filter((a) => a.status === "pending").map((action) => (
                <div key={action._id} className="flex items-center justify-between gap-2 text-sm">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Badge variant={action.priorityLevel === "high" ? "error" : "warning"} className="text-xs shrink-0">
                      {action.priorityLevel}
                    </Badge>
                    <span className="text-foreground truncate">{action.actionDescription}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {onCompleteAction && (
                      <Button variant="ghost" size="sm" onClick={() => onCompleteAction(action._id)} title="Mark Complete">
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                      </Button>
                    )}
                    {onDismissAction && (
                      <Button variant="ghost" size="sm" onClick={() => onDismissAction(action._id)} title="Dismiss">
                        <XCircle className="w-3.5 h-3.5 text-muted-foreground" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {showFeedback && (
          <div className="mt-3 flex gap-2">
            <input
              type="text"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Why is this not an issue? (optional)"
              className="flex-1 px-3 py-1.5 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground"
            />
            <Button
              className="bg-secondary hover:bg-secondary/80 text-secondary-foreground text-sm px-3 py-1.5"
              onClick={handleDismiss}
            >
              Dismiss
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
