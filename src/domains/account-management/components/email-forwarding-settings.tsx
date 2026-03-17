"use client";

import { useState, useCallback } from "react";
import { useBusinessProfile } from "@/contexts/business-context";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Mail,
  Copy,
  Check,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

export default function EmailForwardingSettings() {
  const { profile, isLoading, updateProfile } = useBusinessProfile();

  const [saving, setSaving] = useState(false);
  const [emailCopied, setEmailCopied] = useState(false);

  const isEnabled = profile?.emailForwardingEnabled ?? false;
  // Use slug, emailForwardingPrefix, or slugified business name
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

  const saveSettings = useCallback(
    async (updates: Record<string, unknown>) => {
      if (!profile?.id) return;

      setSaving(true);
      try {
        const response = await fetch(
          "/api/v1/account-management/businesses/profile",
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updates),
          }
        );

        if (!response.ok) throw new Error("Failed to update settings");

        const updatedFields: Partial<{
          emailForwardingEnabled: boolean;
        }> = {};
        if ("email_forwarding_enabled" in updates)
          updatedFields.emailForwardingEnabled =
            updates.email_forwarding_enabled as boolean;
        updateProfile(updatedFields as any);

        toast.success("Settings saved");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to save"
        );
      } finally {
        setSaving(false);
      }
    },
    [profile?.id, updateProfile]
  );

  const handleToggle = async (enabled: boolean) => {
    await saveSettings({ email_forwarding_enabled: enabled });
  };

  const copyEmail = () => {
    if (!forwardingEmail) return;
    navigator.clipboard.writeText(forwardingEmail);
    setEmailCopied(true);
    toast.success("Email copied to clipboard");
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
        <Switch
          checked={isEnabled}
          onCheckedChange={handleToggle}
          disabled={saving}
        />
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
