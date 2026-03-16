"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useUser } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, FileText, Mail, Calendar, AlertCircle } from "lucide-react";
import { formatDistance } from "date-fns";
import { toast } from "sonner";

export default function DocumentsInboxClient() {
  const { user } = useUser();
  const [selectedDocument, setSelectedDocument] = useState<Id<"document_inbox_entries"> | null>(null);
  const [classifyModalOpen, setClassifyModalOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<"receipt" | "invoice" | "e_invoice">("receipt");
  const [businessId, setBusinessId] = useState<Id<"businesses"> | null>(null);

  // Get user's businesses to select one
  // For now, we'll skip the business query and just show a placeholder
  // In production, you'd query the user's businesses and let them select one

  // Query inbox documents - skip if no business selected
  const inboxDocuments = useQuery(
    api.functions.documentInbox.getInboxDocuments,
    businessId ? { businessId, status: "needs_review" } : "skip"
  );

  // Mutation to manually classify document
  const manuallyClassifyDocument = useMutation(api.functions.documentInbox.manuallyClassifyDocument);

  // Mutation to delete document
  const deleteInboxEntry = useMutation(api.functions.documentInbox.deleteInboxEntry);

  const handleClassifyClick = (documentId: Id<"document_inbox_entries">) => {
    setSelectedDocument(documentId);
    setSelectedType("");
    setClassifyModalOpen(true);
  };

  const handleClassifyConfirm = async () => {
    if (!selectedDocument || !selectedType || !businessId) return;

    try {
      await manuallyClassifyDocument({
        inboxEntryId: selectedDocument,
        classifiedType: selectedType,
        classifiedBy: businessId, // TODO: Get actual user ID from Convex
      });

      toast.success("Document classified", {
        description: `Document has been classified as ${selectedType} and routed successfully`,
      });

      setClassifyModalOpen(false);
      setSelectedDocument(null);
      setSelectedType("receipt");
    } catch (error) {
      toast.error("Classification failed", {
        description: error instanceof Error ? error.message : "Failed to classify document",
      });
    }
  };

  const handleDelete = async (documentId: Id<"document_inbox_entries">) => {
    if (!businessId) return;

    if (!confirm("Are you sure you want to delete this document?")) return;

    try {
      await deleteInboxEntry({
        inboxEntryId: documentId,
        deletedBy: businessId, // TODO: Get actual user ID from Convex
        reason: "User deleted from inbox",
      });

      toast.success("Document deleted", {
        description: "Document has been removed from the inbox",
      });
    } catch (error) {
      toast.error("Delete failed", {
        description: error instanceof Error ? error.message : "Failed to delete document",
      });
    }
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">Please sign in to view documents</p>
        </div>
      </div>
    );
  }

  if (!businessId) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No business selected</p>
          <p className="text-sm text-muted-foreground mt-2">
            This feature requires business context. Coming soon: business selector.
          </p>
        </div>
      </div>
    );
  }

  if (inboxDocuments === undefined) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Documents Inbox</h1>
        <p className="text-muted-foreground mt-2">
          Review and classify documents that require manual attention
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card p-4 rounded-lg border">
          <div className="text-sm text-muted-foreground">Needs Review</div>
          <div className="text-2xl font-bold">{inboxDocuments.total}</div>
        </div>
      </div>

      {/* Documents Table */}
      {inboxDocuments.total === 0 ? (
        <div className="bg-card rounded-lg border p-12 text-center">
          <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No documents to review</h3>
          <p className="text-muted-foreground">
            All forwarded documents have been classified and routed.
          </p>
        </div>
      ) : (
        <div className="bg-card rounded-lg border overflow-hidden">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-4 font-medium">Filename</th>
                <th className="text-left p-4 font-medium">Source</th>
                <th className="text-left p-4 font-medium">AI Suggestion</th>
                <th className="text-left p-4 font-medium">Confidence</th>
                <th className="text-left p-4 font-medium">Received</th>
                <th className="text-right p-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {inboxDocuments.documents.map((doc) => (
                <tr key={doc._id} className="border-t hover:bg-muted/50">
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{doc.originalFilename}</span>
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Mail className="h-4 w-4" />
                      {doc.emailMetadata.from}
                    </div>
                  </td>
                  <td className="p-4">
                    {doc.aiDetectedType ? (
                      <Badge variant="outline">
                        {doc.aiDetectedType === "receipt" ? "Receipt" :
                         doc.aiDetectedType === "invoice" ? "AP Invoice" :
                         doc.aiDetectedType === "e_invoice" ? "E-Invoice" : "Unknown"}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </td>
                  <td className="p-4">
                    {doc.aiConfidence !== undefined ? (
                      <Badge
                        variant={
                          doc.aiConfidence >= 0.85 ? "default" :
                          doc.aiConfidence >= 0.7 ? "secondary" : "destructive"
                        }
                      >
                        {Math.round(doc.aiConfidence * 100)}%
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      {formatDistance(new Date(doc._creationTime), new Date(), { addSuffix: true })}
                    </div>
                  </td>
                  <td className="p-4 text-right space-x-2">
                    <Button
                      size="sm"
                      onClick={() => handleClassifyClick(doc._id)}
                      className="bg-primary hover:bg-primary/90 text-primary-foreground"
                    >
                      Classify
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(doc._id)}
                      className="text-destructive hover:text-destructive"
                    >
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Classification Modal */}
      <Dialog open={classifyModalOpen} onOpenChange={setClassifyModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Classify Document</DialogTitle>
            <DialogDescription>
              Select the document type to route it to the correct destination.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Document Type</label>
              <Select value={selectedType} onValueChange={(value: "receipt" | "invoice" | "e_invoice") => setSelectedType(value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select document type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="receipt">Receipt (Expense Claim)</SelectItem>
                  <SelectItem value="invoice">AP Invoice (Supplier Bill)</SelectItem>
                  <SelectItem value="e_invoice">E-Invoice (LHDN)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setClassifyModalOpen(false)}
              className="bg-secondary hover:bg-secondary/80 text-secondary-foreground"
            >
              Cancel
            </Button>
            <Button
              onClick={handleClassifyConfirm}
              disabled={!selectedType}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
