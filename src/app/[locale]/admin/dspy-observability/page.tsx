/**
 * DSPy Observability Dashboard Page (027-dspy-dash)
 *
 * Internal-only admin page showing DSPy self-improvement metrics.
 * Uses action-based data loading (not reactive queries) to minimize Convex bandwidth.
 */

export const dynamic = "force-dynamic";

import { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Sidebar from "@/components/ui/sidebar";
import HeaderWithUser from "@/components/ui/header-with-user";
import { ClientProviders } from "@/components/providers/client-providers";
import DspyDashboard from "@/domains/admin/dspy-observability/components/dspy-dashboard";

export const metadata: Metadata = {
  title: "DSPy Observability | Groot Finance",
  description: "Internal dashboard for DSPy self-improvement metrics",
};

export default async function DspyObservabilityPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  // Restrict to Groot team members only
  const { sessionClaims } = await auth();
  const userEmail = sessionClaims?.email as string | undefined;

  if (!userEmail?.endsWith("@hellogroot.com")) {
    return (
      <ClientProviders>
        <div className="flex h-screen bg-background items-center justify-center">
          <div className="text-center space-y-4">
            <h1 className="text-2xl font-semibold text-foreground">Access Denied</h1>
            <p className="text-muted-foreground max-w-md">
              This dashboard is for Groot team members only. If you believe this is an error,
              please contact your administrator.
            </p>
          </div>
        </div>
      </ClientProviders>
    );
  }

  return (
    <ClientProviders>
      <div className="flex h-screen bg-background">
        <Sidebar />
        <div className="flex flex-col flex-1 overflow-hidden">
          <HeaderWithUser
            title="DSPy Observability"
            subtitle="Self-improvement metrics for all DSPy tools"
          />
          <main className="flex-1 overflow-y-auto p-6">
            <DspyDashboard />
          </main>
        </div>
      </div>
    </ClientProviders>
  );
}
