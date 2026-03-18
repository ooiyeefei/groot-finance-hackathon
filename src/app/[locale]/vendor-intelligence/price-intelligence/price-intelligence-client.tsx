"use client";

import { useActiveBusiness } from "@/contexts/business-context";
import { usePriceHistory, usePriceTrendData } from "@/domains/vendor-intelligence/hooks/use-price-history";
import { useCrossVendorGroups } from "@/domains/vendor-intelligence/hooks/use-cross-vendor-groups";
import { PriceHistoryChart } from "@/domains/vendor-intelligence/components/price-history-chart";
import { CsvExportButton } from "@/domains/vendor-intelligence/components/csv-export-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp, GitCompare } from "lucide-react";
import { Id } from "../../../../../convex/_generated/dataModel";
import { formatCurrency } from "@/lib/utils/format-number";
import { formatBusinessDate } from "@/lib/utils";

export default function PriceIntelligenceClient() {
  const { businessId: rawBusinessId, isLoading: isBusinessLoading } =
    useActiveBusiness();
  const businessId = rawBusinessId
    ? (rawBusinessId as Id<"businesses">)
    : undefined;

  const { items, isLoading } = usePriceHistory(businessId);
  const { groups, isLoading: isGroupsLoading } =
    useCrossVendorGroups(businessId);

  if (isBusinessLoading || isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  // Get unique items for the price trends tab
  const uniqueItems = [
    ...new Map(
      items.map((item: Record<string, unknown>) => {
        const vendor = item.vendor as { name?: string } | undefined;
        const vendorId = item.vendorId as string;
        const itemId = (item.itemIdentifier ?? item.itemDescription) as string;
        return [
          `${vendorId}-${itemId}`,
          {
            vendorId,
            vendorName: vendor?.name ?? "Unknown",
            itemIdentifier: itemId,
            itemDescription: item.itemDescription as string,
            currentPrice: item.unitPrice as number,
            currency: item.currency as string,
          },
        ] as const;
      })
    ).values(),
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">
          Price Intelligence
        </h2>
        <CsvExportButton data={items as any} />
      </div>

      <Tabs defaultValue="trends" className="w-full">
        <TabsList>
          <TabsTrigger value="trends" className="gap-1.5">
            <TrendingUp className="w-4 h-4" />
            Price Trends
          </TabsTrigger>
          <TabsTrigger value="cross-vendor" className="gap-1.5">
            <GitCompare className="w-4 h-4" />
            Cross-Vendor
          </TabsTrigger>
        </TabsList>

        <TabsContent value="trends" className="space-y-4 mt-4">
          {uniqueItems.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <TrendingUp className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">No price history data yet</p>
              <p className="text-xs mt-1">
                Price trends will appear after invoices are processed
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {uniqueItems.slice(0, 10).map((item) => (
                <Card key={`${item.vendorId}-${item.itemIdentifier}`} className="bg-card border-border">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm text-foreground">
                        {item.itemDescription}
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        <Badge variant="info" className="text-xs">
                          {item.vendorName}
                        </Badge>
                        <span className="text-sm font-semibold text-foreground">
                          {formatCurrency(item.currentPrice, item.currency)}
                        </span>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <PriceHistoryChart
                      dataPoints={items
                        .filter(
                          (r: Record<string, unknown>) =>
                            r.vendorId === item.vendorId &&
                            ((r.itemIdentifier ?? r.itemDescription) as string) ===
                              item.itemIdentifier
                        )
                        .map((r: Record<string, unknown>) => ({
                          date: (r.invoiceDate ?? r.observedAt) as string,
                          unitPrice: r.unitPrice as number,
                          currency: r.currency as string,
                        }))}
                      currency={item.currency}
                    />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="cross-vendor" className="space-y-4 mt-4">
          {groups.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <GitCompare className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">No cross-vendor groups yet</p>
              <p className="text-xs mt-1">
                AI will suggest item groups when similar items are found across
                vendors
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {groups.map((group) => (
                <Card key={group._id} className="bg-card border-border">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-foreground">
                        {group.groupName}
                      </span>
                      <Badge
                        variant={
                          group.matchSource === "ai-suggested"
                            ? "info"
                            : "success"
                        }
                        className="text-xs"
                      >
                        {group.matchSource}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {group.itemReferences.length} vendors compared
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
