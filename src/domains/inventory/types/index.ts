import type { Id, Doc } from "../../../../convex/_generated/dataModel";

export type InventoryLocation = Doc<"inventory_locations">;
export type InventoryStock = Doc<"inventory_stock">;
export type InventoryMovement = Doc<"inventory_movements">;

export type LocationType = "warehouse" | "office" | "retail" | "other";
export type LocationStatus = "active" | "inactive";
export type MovementType = "stock_in" | "stock_out" | "transfer" | "adjustment";

export interface StockByProduct {
  location: InventoryLocation;
  stock: InventoryStock;
}

export interface AvailableStock {
  locationId: Id<"inventory_locations">;
  locationName: string;
  quantityOnHand: number;
}

export interface DashboardSummary {
  totalItems: number;
  totalLocations: number;
  lowStockCount: number;
  lowStockItems: Array<{
    itemName: string;
    itemSku?: string;
    catalogItemId: Id<"catalog_items">;
    locationName: string;
    locationId: Id<"inventory_locations">;
    quantityOnHand: number;
    reorderLevel: number;
  }>;
  recentMovements: Array<
    InventoryMovement & {
      itemName: string;
      locationName: string;
    }
  >;
}

export interface ReceiveInventoryItem {
  catalogItemId: Id<"catalog_items">;
  locationId: Id<"inventory_locations">;
  quantity: number;
  unitCostOriginal: number;
  unitCostOriginalCurrency: string;
  unitCostHome: number;
  description: string;
  trackInventory: boolean;
  catalogMatch?: string;
}
