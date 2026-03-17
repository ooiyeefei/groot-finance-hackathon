"use client";

import { useState, useCallback } from "react";
import { useBusinessProfile } from "@/contexts/business-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Mail,
  Copy,
  Check,
  Plus,
  X,
  Loader2,
  Info,
} from "lucide-react";
import { toast } from "sonner";

export default function EmailForwardingSettings() {
  const { profile, isLoading, updateProfile } = useBusinessProfile();

  const [saving, setSaving] = useState(false);
  const [emailCopied, setEmailCopied] = useState(false);
  const [newEmail, setNewEmail] = useState("");

  const isEnabled = profile?.emailForwardingEnabled ?? false;
  const allowlist: string[] = profile?.emailForwardingAllowlist ?? [];
  // Use slug, or fall back to slugified business name
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
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(updates),
          }
        );

        if (!response.ok) {
          throw new Error("Failed to update settings");
        }

        // Update local profile cache
        const updatedFields: Partial<{ emailForwardingEnabled: boolean; emailForwardingAllowlist: string[] }> = {};
        if ("email_forwarding_enabled" in updates)
          updatedFields.emailForwardingEnabled =
            updates.email_forwarding_enabled as boolean;
        if ("email_forwarding_allowlist" in updates)
          updatedFields.emailForwardingAllowlist =
            updates.email_forwarding_allowlist as string[];
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

  const handleAddEmail = async () => {
    const email = newEmail.trim().toLowerCase();
    if (!email) return;

    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Please enter a valid email address");
      return;
    }

    if (allowlist.includes(email)) {
      toast.error("Email already in allowlist");
      return;
    }

    const updated = [...allowlist, email];
    await saveSettings({ email_forwarding_allowlist: updated });
    setNewEmail("");
  };

  const handleRemoveEmail = async (emailToRemove: string) => {
    const updated = allowlist.filter((e) => e !== emailToRemove);
    await saveSettings({ email_forwarding_allowlist: updated });
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
            Allow team members to forward documents via email
          </div>
        </div>
        <Switch
          checked={isEnabled}
          onCheckedChange={handleToggle}
          disabled={saving || !slug}
        />
      </div>

      {/* Forwarding Email (shown when enabled) */}
      {isEnabled && forwardingEmail && (
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
            Share this email with your team. Forward receipts and invoices as
            attachments (PDF, JPG, PNG).
          </p>
        </div>
      )}

      {/* No slug warning */}
      {!slug && (
        <div className="flex items-start gap-3 bg-yellow-500/10 rounded-lg p-4 border border-yellow-500/30">
          <Info className="h-5 w-5 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
          <div className="text-sm text-foreground">
            Your business needs a URL slug before email forwarding can be
            enabled. Please contact support.
          </div>
        </div>
      )}

      {/* Authorized Senders */}
      {isEnabled && (
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground">
              Authorized Senders
            </label>
            <p className="text-sm text-muted-foreground mt-1">
              Only emails from these addresses will be processed. Others are
              silently ignored for security.
            </p>
          </div>

          {/* Add Email Input */}
          <div className="flex items-center gap-2">
            <Input
              type="email"
              placeholder="teammate@company.com"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddEmail()}
              className="flex-1"
            />
            <Button
              size="sm"
              onClick={handleAddEmail}
              disabled={saving || !newEmail.trim()}
              className="bg-primary hover:bg-primary/90 text-primary-foreground shrink-0"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Add
            </Button>
          </div>

          {/* Email List */}
          {allowlist.length > 0 ? (
            <div className="space-y-2">
              {allowlist.map((email) => (
                <div
                  key={email}
                  className="flex items-center justify-between bg-muted/30 rounded-lg px-4 py-2 border"
                >
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-foreground">{email}</span>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleRemoveEmail(email)}
                    disabled={saving}
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 bg-muted/30 rounded-lg border border-dashed">
              <Mail className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                No authorized senders yet. Add email addresses above.
              </p>
            </div>
          )}

          {/* How It Works Summary */}
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
