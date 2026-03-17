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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  FileText,
  Mail,
  Calendar,
  AlertCircle,
  Info,
  Copy,
  Check,
  ArrowRight,
  Inbox,
} from "lucide-react";
import { formatDistance } from "date-fns";
import { toast } from "sonner";

export default function DocumentsInboxClient() {
  const { user } = useUser();
  const [selectedDocument, setSelectedDocument] =
    useState<Id<"document_inbox_entries"> | null>(null);
  const [classifyModalOpen, setClassifyModalOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<
    "receipt" | "invoice" | "e_invoice"
  >("receipt");
  const [emailCopied, setEmailCopied] = useState(false);

  // Get the current business (same pattern as billing page)
  const currentBusiness = useQuery(
    api.functions.businesses.getCurrentBusiness
  );

  const businessId = currentBusiness?._id ?? null;
  const forwardingPrefix = currentBusiness?.emailForwardingPrefix ?? currentBusiness?.slug;
  const forwardingEmail = forwardingPrefix
    ? `docs@${forwardingPrefix}.hellogroot.com`
    : null;
  const forwardingEnabled = currentBusiness?.emailForwardingEnabled ?? false;

  // Query inbox documents
  const inboxDocuments = useQuery(
    api.functions.documentInbox.getInboxDocuments,
    businessId ? { businessId, status: "needs_review" } : "skip"
  );

  // Inbox stats
  const inboxStats = useQuery(
    api.functions.documentInbox.getInboxStats,
    businessId ? { businessId, period: "30d" } : "skip"
  );

  const manuallyClassifyDocument = useMutation(
    api.functions.documentInbox.manuallyClassifyDocument
  );
  const deleteInboxEntry = useMutation(
    api.functions.documentInbox.deleteInboxEntry
  );

  const handleClassifyClick = (documentId: Id<"document_inbox_entries">) => {
    setSelectedDocument(documentId);
    setSelectedType("receipt");
    setClassifyModalOpen(true);
  };

  const handleClassifyConfirm = async () => {
    if (!selectedDocument || !selectedType) return;

    try {
      await manuallyClassifyDocument({
        inboxEntryId: selectedDocument,
        classifiedType: selectedType,
        classifiedBy: undefined,
      });

      toast.success("Document classified", {
        description: `Routed as ${selectedType === "receipt" ? "Expense Receipt" : selectedType === "invoice" ? "AP Invoice" : "E-Invoice"}`,
      });

      setClassifyModalOpen(false);
      setSelectedDocument(null);
      setSelectedType("receipt");
    } catch (error) {
      toast.error("Classification failed", {
        description:
          error instanceof Error ? error.message : "Failed to classify",
      });
    }
  };

  const handleDelete = async (documentId: Id<"document_inbox_entries">) => {
    if (!confirm("Are you sure you want to delete this document?")) return;

    try {
      await deleteInboxEntry({
        inboxEntryId: documentId,
        deletedBy: undefined,
        reason: "User deleted from inbox",
      });
      toast.success("Document deleted");
    } catch (error) {
      toast.error("Delete failed", {
        description:
          error instanceof Error ? error.message : "Failed to delete",
      });
    }
  };

  const copyEmail = () => {
    if (!forwardingEmail) return;
    navigator.clipboard.writeText(forwardingEmail);
    setEmailCopied(true);
    toast.success("Email copied to clipboard");
    setTimeout(() => setEmailCopied(false), 2000);
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

  if (currentBusiness === undefined) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!currentBusiness) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No business found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Info Button */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">Documents Inbox</h1>
            <HowItWorksDrawer forwardingEmail={forwardingEmail} />
          </div>
          <p className="text-muted-foreground mt-2">
            Review and classify documents that need manual attention
          </p>
        </div>

        {/* Forwarding Email Display */}
        {forwardingEmail && (
          <div className="flex items-center gap-2 bg-card border rounded-lg px-4 py-2">
            <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
            <code className="text-sm font-mono text-foreground">
              {forwardingEmail}
            </code>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              onClick={copyEmail}
            >
              {emailCopied ? (
                <Check className="h-3.5 w-3.5 text-green-500" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        )}
      </div>

      {/* Stats Row */}
      {inboxStats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-card p-4 rounded-lg border">
            <div className="text-sm text-muted-foreground">Needs Review</div>
            <div className="text-2xl font-bold">{inboxStats.needsReview}</div>
          </div>
          <div className="bg-card p-4 rounded-lg border">
            <div className="text-sm text-muted-foreground">Auto-Routed</div>
            <div className="text-2xl font-bold">{inboxStats.totalProcessed}</div>
          </div>
          <div className="bg-card p-4 rounded-lg border">
            <div className="text-sm text-muted-foreground">Auto-Route Rate</div>
            <div className="text-2xl font-bold">{inboxStats.autoRouteRate}%</div>
          </div>
          <div className="bg-card p-4 rounded-lg border">
            <div className="text-sm text-muted-foreground">Duplicates Caught</div>
            <div className="text-2xl font-bold">{inboxStats.totalQuarantined}</div>
          </div>
        </div>
      )}

      {/* Documents Table or Empty State */}
      {inboxDocuments === undefined ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : inboxDocuments.total === 0 ? (
        <EmptyInboxState
          forwardingEmail={forwardingEmail}
          forwardingEnabled={forwardingEnabled}
          onCopyEmail={copyEmail}
          emailCopied={emailCopied}
        />
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
                        {doc.aiDetectedType === "receipt"
                          ? "Receipt"
                          : doc.aiDetectedType === "invoice"
                            ? "AP Invoice"
                            : doc.aiDetectedType === "e_invoice"
                              ? "E-Invoice"
                              : "Unknown"}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">--</span>
                    )}
                  </td>
                  <td className="p-4">
                    {doc.aiConfidence !== undefined ? (
                      <Badge
                        variant={
                          doc.aiConfidence >= 0.85
                            ? "default"
                            : doc.aiConfidence >= 0.7
                              ? "secondary"
                              : "destructive"
                        }
                      >
                        {Math.round(doc.aiConfidence * 100)}%
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">--</span>
                    )}
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      {formatDistance(new Date(doc._creationTime), new Date(), {
                        addSuffix: true,
                      })}
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
              <Select
                value={selectedType}
                onValueChange={(
                  value: "receipt" | "invoice" | "e_invoice"
                ) => setSelectedType(value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select document type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="receipt">
                    Receipt (Expense Claim)
                  </SelectItem>
                  <SelectItem value="invoice">
                    AP Invoice (Supplier Bill)
                  </SelectItem>
                  <SelectItem value="e_invoice">
                    E-Invoice (LHDN)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
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

// ============================================================================
// How It Works — Info Drawer
// ============================================================================

function HowItWorksDrawer({
  forwardingEmail,
}: {
  forwardingEmail: string | null;
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 rounded-full"
        >
          <Info className="h-4 w-4 text-muted-foreground" />
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[400px] sm:w-[480px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>How Email Forwarding Works</SheetTitle>
          <SheetDescription>
            Forward receipts and invoices to Groot via email. AI classifies and
            routes them automatically.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 mt-6">
          {/* Your Email Address */}
          {forwardingEmail && (
            <div className="bg-muted/50 rounded-lg p-4 border">
              <div className="text-sm font-medium text-muted-foreground mb-1">
                Your Forwarding Email
              </div>
              <code className="text-base font-mono text-foreground break-all">
                {forwardingEmail}
              </code>
            </div>
          )}

          {/* Step-by-Step Guide */}
          <div className="space-y-4">
            <h3 className="font-semibold text-foreground">
              3 Simple Steps
            </h3>

            <div className="space-y-3">
              <Step
                number={1}
                title="Forward your email"
                description="Forward any email with receipt or invoice attachments (PDF, JPG, PNG) to the address above."
              />
              <Step
                number={2}
                title="AI classifies automatically"
                description="Groot's AI reads the document and determines if it's a receipt or an invoice within 30 seconds."
              />
              <Step
                number={3}
                title="Document appears in the right place"
                description="High-confidence documents go directly to Expense Claims or AP Invoices. Low-confidence ones appear here for you to classify manually."
              />
            </div>
          </div>

          {/* What Gets Routed Where */}
          <div className="space-y-3">
            <h3 className="font-semibold text-foreground">
              Where Documents Go
            </h3>

            <div className="space-y-2">
              <RouteItem
                type="Receipts"
                destination="Expense Claims"
                description="Restaurant bills, taxi receipts, hotel stays, office supplies"
              />
              <RouteItem
                type="Invoices"
                destination="AP Invoices"
                description="Vendor bills, supplier invoices, service agreements"
              />
              <RouteItem
                type="Unclear"
                destination="This Inbox"
                description="Blurry images, mixed documents, or when AI is unsure"
              />
            </div>
          </div>

          {/* Tips */}
          <div className="space-y-3">
            <h3 className="font-semibold text-foreground">Tips</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                Send up to 10 attachments per email
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                Supported formats: PDF, JPG, PNG
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                Duplicates are automatically detected
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                Only authorized emails in your allowlist can forward
              </li>
            </ul>
          </div>

          {/* Manage Settings Link */}
          <div className="pt-2 border-t">
            <p className="text-sm text-muted-foreground">
              To manage authorized senders or disable forwarding, go to{" "}
              <a
                href="/business-settings"
                className="text-primary hover:underline"
              >
                Business Settings
              </a>
              .
            </p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Step({
  number,
  title,
  description,
}: {
  number: number;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">
        {number}
      </div>
      <div>
        <div className="font-medium text-foreground">{title}</div>
        <div className="text-sm text-muted-foreground">{description}</div>
      </div>
    </div>
  );
}

function RouteItem({
  type,
  destination,
  description,
}: {
  type: string;
  destination: string;
  description: string;
}) {
  return (
    <div className="flex items-center gap-3 bg-muted/30 rounded-lg p-3 border">
      <div className="shrink-0">
        <Badge variant="outline" className="text-xs">
          {type}
        </Badge>
      </div>
      <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
      <div className="min-w-0">
        <div className="text-sm font-medium text-foreground">{destination}</div>
        <div className="text-xs text-muted-foreground truncate">
          {description}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Empty State with Onboarding
// ============================================================================

function EmptyInboxState({
  forwardingEmail,
  forwardingEnabled,
  onCopyEmail,
  emailCopied,
}: {
  forwardingEmail: string | null;
  forwardingEnabled: boolean;
  onCopyEmail: () => void;
  emailCopied: boolean;
}) {
  return (
    <div className="bg-card rounded-lg border p-12">
      <div className="max-w-lg mx-auto text-center">
        <Inbox className="h-16 w-16 text-muted-foreground mx-auto mb-6" />

        <h3 className="text-xl font-semibold mb-2">No documents to review</h3>
        <p className="text-muted-foreground mb-8">
          {forwardingEnabled
            ? "All forwarded documents have been auto-classified. Documents that need your attention will appear here."
            : "Enable email forwarding to start receiving documents via email."}
        </p>

        {/* Onboarding Card */}
        {forwardingEmail && (
          <div className="bg-muted/50 rounded-lg p-6 text-left space-y-4">
            <h4 className="font-semibold text-foreground">
              Get started with email forwarding
            </h4>

            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-medium">
                  1
                </div>
                <div>
                  <div className="text-sm text-foreground">
                    Copy your forwarding email:
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <code className="text-sm font-mono bg-card px-2 py-1 rounded border">
                      {forwardingEmail}
                    </code>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      onClick={onCopyEmail}
                    >
                      {emailCopied ? (
                        <Check className="h-3.5 w-3.5 text-green-500" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-medium">
                  2
                </div>
                <div className="text-sm text-foreground">
                  Forward any email with receipt or invoice attachments (PDF, JPG, PNG)
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-medium">
                  3
                </div>
                <div className="text-sm text-foreground">
                  AI auto-classifies and routes to Expense Claims or AP Invoices.
                  Only unclear documents appear here.
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
