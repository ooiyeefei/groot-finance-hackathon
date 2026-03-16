"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { useState, useCallback } from "react";
import type { AlertType, SeverityLevel, AlertStatus } from "../types";

/**
 * T021: Custom hook for anomaly alerts with filter state and dismiss mutation.
 */
export function useAnomalyAlerts(businessId: Id<"businesses"> | undefined) {
  const [vendorId, setVendorId] = useState<Id<"vendors"> | undefined>();
  const [status, setStatus] = useState<AlertStatus | undefined>("active");
  const [severityLevel, setSeverityLevel] = useState<
    SeverityLevel | undefined
  >();
  const [alertType, setAlertType] = useState<AlertType | undefined>();
  const [limit, setLimit] = useState(50);

  const alerts = useQuery(
    api.functions.vendorPriceAnomalies.listAlerts,
    businessId
      ? { businessId, vendorId, status, severityLevel, alertType, limit }
      : "skip"
  );

  const dismissMutation = useMutation(
    api.functions.vendorPriceAnomalies.dismissAlert
  );

  const dismissAlert = useCallback(
    async (alertId: Id<"vendor_price_anomalies">, feedback?: string) => {
      await dismissMutation({ alertId, userFeedback: feedback });
    },
    [dismissMutation]
  );

  const resetFilters = () => {
    setVendorId(undefined);
    setStatus("active");
    setSeverityLevel(undefined);
    setAlertType(undefined);
  };

  return {
    alerts: alerts ?? [],
    isLoading: alerts === undefined,
    // Actions
    dismissAlert,
    // Filter setters
    setVendorId,
    setStatus,
    setSeverityLevel,
    setAlertType,
    setLimit,
    // Reset
    resetFilters,
    // Current filters
    filters: { vendorId, status, severityLevel, alertType },
  };
}
