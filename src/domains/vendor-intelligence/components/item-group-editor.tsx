"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Id } from "../../../../convex/_generated/dataModel";

interface ItemReference {
  vendorId: Id<"vendors">;
  itemIdentifier: string;
  vendorName?: string;
}

interface ItemGroupEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupName?: string;
  itemReferences?: ItemReference[];
  onSave: (groupName: string, itemReferences: ItemReference[]) => void;
  mode: "create" | "edit";
}

/**
 * T047: Dialog for creating/editing cross-vendor item groups.
 */
export function ItemGroupEditor({
  open,
  onOpenChange,
  groupName: initialName = "",
  itemReferences: initialRefs = [],
  onSave,
  mode,
}: ItemGroupEditorProps) {
  const [groupName, setGroupName] = useState(initialName);
  const [items, setItems] = useState<ItemReference[]>(initialRefs);

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    if (!groupName.trim() || items.length < 2) return;
    onSave(groupName.trim(), items);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            {mode === "create" ? "Create Item Group" : "Edit Item Group"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <label className="text-sm font-medium text-foreground">
              Group Name
            </label>
            <Input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="e.g., M8 Steel Bolt"
              className="mt-1"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-foreground">
              Items ({items.length} vendors)
            </label>
            {items.length < 2 && (
              <p className="text-xs text-destructive mt-1">
                Need at least 2 vendors for comparison
              </p>
            )}
            <div className="space-y-2 mt-2">
              {items.map((item, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 p-2 rounded-md bg-muted border border-border"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {item.vendorName ?? "Unknown Vendor"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {item.itemIdentifier}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveItem(index)}
                  >
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button
            className="bg-secondary hover:bg-secondary/80 text-secondary-foreground"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
            onClick={handleSave}
            disabled={!groupName.trim() || items.length < 2}
          >
            {mode === "create" ? "Create Group" : "Save Changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
