"use client";

import { useState } from "react";
import { useBusinessProfile } from "@/contexts/business-context";
import { useToast } from "@/components/ui/toast";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Mail, Copy, Check, Loader2 } from "lucide-react";

export default function EmailForwardingSettings() {
  const { profile, isLoading, updateProfile } = useBusinessProfile();
  const { addToast } = useToast();

  const [saving, setSaving] = useState(false);
  const [emailCopied, setEmailCopied] = useState(false);

  const isEnabled = profile?.emailForwardingEnabled ?? false;
  const slug =
    profile?.slug ||
    profile?.emailForwardingPrefix ||
    (profile?.name
      ? profile.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
      : "");
  const forwardingEmail = slug ? `inbox@${slug}.hellogroot.com` : null;

  const handleToggle = async (enabled: boolean) => {
    if (saving) return;

    try {
      setSaving(true);

      // Get CSRF token (same pattern as currency-preferences.tsx)
      const csrfResponse = await fetch("/api/v1/utils/security/csrf-token");
      if (!csrfResponse.ok) throw new Error("Failed to get CSRF token");
      const csrfData = await csrfResponse.json();
      if (!csrfData.success) throw new Error(csrfData.error || "Failed to get CSRF token");

      const response = await fetch(
        "/api/v1/account-management/businesses/profile",
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrfData.data.csrfToken,
          },
          body: JSON.stringify({ email_forwarding_enabled: enabled }),
        }
      );

      const result = await response.json();

      if (result.success) {
        updateProfile(result.data);
        addToast({
          type: "success",
          title: enabled ? "Document Inbox enabled" : "Document Inbox disabled",
          description: enabled
            ? "Team members can now forward documents via email"
            : "Email forwarding has been turned off",
        });
      } else {
        throw new Error(result.error || "Failed to update settings");
      }
    } catch (error) {
      console.error("[Document Inbox Settings] Failed to toggle:", error);
      addToast({
        type: "error",
        title: "Failed to update settings",
        description:
          error instanceof Error ? error.message : "Unable to save",
      });
    } finally {
      setSaving(false);
    }
  };

  const copyEmail = () => {
    if (!forwardingEmail) return;
    navigator.clipboard.writeText(forwardingEmail);
    setEmailCopied(true);
    addToast({ type: "success", title: "Email copied to clipboard" });
    setTimeout(() => setEmailCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold text-foreground">
          Document Inbox Settings
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Forward receipts and invoices to Groot via email. AI auto-classifies
          and routes them to Expense Claims or AP Invoices.
        </p>
      </div>

      {/* Enable Toggle */}
      <div className="flex items-center justify-between py-4 border-b">
        <div>
          <div className="font-medium text-foreground">
            Enable Document Inbox
          </div>
          <div className="text-sm text-muted-foreground">
            All team members can forward documents via email
          </div>
        </div>
        <div className="flex items-center gap-2">
          {saving && (
            <span className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          )}
          <Switch
            checked={isEnabled}
            onCheckedChange={handleToggle}
            disabled={saving}
          />
        </div>
      </div>

      {/* Forwarding Email + How It Works (shown when enabled) */}
      {isEnabled && forwardingEmail && (
        <div className="space-y-6">
          {/* Forwarding Email */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Your Forwarding Email
            </label>
            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center gap-2 bg-muted/50 rounded-lg px-4 py-3 border">
                <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                <code className="text-sm font-mono text-foreground break-all">
                  {forwardingEmail}
                </code>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="shrink-0 h-10 w-10 p-0"
                onClick={copyEmail}
              >
                {emailCopied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Share this email with your team. Any team member can forward
              receipts and invoices as attachments (PDF, JPG, PNG).
            </p>
          </div>

          {/* How It Works */}
          <div className="bg-muted/30 rounded-lg p-4 border space-y-2">
            <div className="text-sm font-medium text-foreground">
              How it works
            </div>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>
                1. Team members forward emails with attachments to the address
                above
              </li>
              <li>
                2. AI classifies each document as a receipt or invoice (within
                30 seconds)
              </li>
              <li>
                3. High-confidence documents auto-route to Expense Claims or AP
                Invoices
              </li>
              <li>
                4. Low-confidence documents appear in the Documents Inbox for
                manual review
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
