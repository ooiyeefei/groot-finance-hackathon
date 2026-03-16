"use client";

import { useActiveBusiness } from "@/contexts/business-context";
import { useVendorScorecard } from "@/domains/vendor-intelligence/hooks/use-vendor-scorecard";
import { useVendorRiskProfile } from "@/domains/vendor-intelligence/hooks/use-vendor-risk-profile";
import { useAnomalyAlerts } from "@/domains/vendor-intelligence/hooks/use-anomaly-alerts";
import { VendorScorecardCard } from "@/domains/vendor-intelligence/components/vendor-scorecard-card";
import { VendorRiskProfile } from "@/domains/vendor-intelligence/components/vendor-risk-profile";
import { AnomalyAlertCard } from "@/domains/vendor-intelligence/components/anomaly-alert-card";
import { Badge } from "@/components/ui/badge";
import { Id } from "../../../../../../convex/_generated/dataModel";

interface VendorDetailClientProps {
  vendorId: string;
}

export default function VendorDetailClient({
  vendorId,
}: VendorDetailClientProps) {
  const { businessId: rawBusinessId, isLoading: isBusinessLoading } =
    useActiveBusiness();
  const businessId = rawBusinessId
    ? (rawBusinessId as Id<"businesses">)
    : undefined;
  const typedVendorId = vendorId as Id<"vendors">;

  const { scorecard, isLoading: isScorecardLoading } = useVendorScorecard(
    businessId,
    typedVendorId
  );
  const { profile, isLoading: isRiskLoading } = useVendorRiskProfile(
    businessId,
    typedVendorId
  );
  const { alerts, dismissAlert, isLoading: isAlertsLoading } =
    useAnomalyAlerts(businessId);

  // Filter alerts for this vendor
  const vendorAlerts = alerts.filter(
    (a) => a.vendorId === typedVendorId && a.status === "active"
  );

  if (isBusinessLoading || isScorecardLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Scorecard */}
      {scorecard ? (
        <VendorScorecardCard scorecard={scorecard} />
      ) : (
        <div className="text-sm text-muted-foreground p-4 bg-muted rounded-lg">
          No scorecard data available yet. Scorecard will be calculated after
          invoices are processed.
        </div>
      )}

      {/* Risk Profile */}
      {profile && <VendorRiskProfile profile={profile} />}

      {/* Active Alerts */}
      {vendorAlerts.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">
              Active Alerts
            </h3>
            <Badge variant="warning">{vendorAlerts.length}</Badge>
          </div>
          {vendorAlerts.slice(0, 5).map((alert) => (
            <AnomalyAlertCard
              key={alert._id}
              alert={alert}
              onDismiss={dismissAlert}
            />
          ))}
        </div>
      )}
    </div>
  );
}
