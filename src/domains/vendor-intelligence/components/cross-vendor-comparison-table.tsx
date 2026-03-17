"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils/format-number";
import { formatBusinessDate } from "@/lib/utils";

interface CrossVendorComparisonRow {
  vendorId: string;
  vendorName: string;
  currentUnitPrice: number;
  lastPriceChangeDate: string;
  priceStabilityScore: number;
  currency: string;
}

interface CrossVendorComparisonTableProps {
  groupName: string;
  priceData: CrossVendorComparisonRow[];
}

/**
 * T046: Cross-vendor comparison table.
 * Displays vendors sorted by price (lowest first), highlights best price.
 */
export function CrossVendorComparisonTable({
  groupName,
  priceData,
}: CrossVendorComparisonTableProps) {
  if (priceData.length === 0) {
    return (
      <div className="text-sm text-muted-foreground p-4">
        No price data available for this group.
      </div>
    );
  }

  const lowestPrice = Math.min(...priceData.map((d) => d.currentUnitPrice));

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-foreground">{groupName}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-foreground">
                  Vendor
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium text-foreground">
                  Unit Price
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium text-foreground">
                  Last Change
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium text-foreground">
                  Stability
                </th>
              </tr>
            </thead>
            <tbody>
              {priceData.map((row) => {
                const isBestPrice = row.currentUnitPrice === lowestPrice;
                return (
                  <tr
                    key={row.vendorId}
                    className="border-b border-border hover:bg-muted/50"
                  >
                    <td className="px-3 py-2 text-sm text-foreground">
                      <div className="flex items-center gap-2">
                        {row.vendorName}
                        {isBestPrice && (
                          <Badge variant="success" className="text-xs">
                            Best Price
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td
                      className={`px-3 py-2 text-sm text-right font-medium ${
                        isBestPrice ? "text-emerald-600" : "text-foreground"
                      }`}
                    >
                      {formatCurrency(row.currentUnitPrice, row.currency)}
                    </td>
                    <td className="px-3 py-2 text-sm text-right text-muted-foreground">
                      {row.lastPriceChangeDate
                        ? formatBusinessDate(row.lastPriceChangeDate)
                        : "N/A"}
                    </td>
                    <td className="px-3 py-2 text-sm text-right">
                      <span
                        className={
                          row.priceStabilityScore >= 70
                            ? "text-emerald-600"
                            : row.priceStabilityScore >= 40
                              ? "text-yellow-600"
                              : "text-destructive"
                        }
                      >
                        {row.priceStabilityScore}/100
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
