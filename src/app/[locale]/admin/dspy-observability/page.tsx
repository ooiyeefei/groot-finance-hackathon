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
