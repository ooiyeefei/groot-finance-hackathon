// Force dynamic rendering - required for authentication
export const dynamic = "force-dynamic";

/**
 * T024: Vendor Intelligence — Price Alerts Page
 * Server component with auth check wrapping AlertsClient.
 */

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Sidebar from "@/components/ui/sidebar";
import HeaderWithUser from "@/components/ui/header-with-user";
import { ClientProviders } from "@/components/providers/client-providers";
import AlertsClient from "./alerts-client";

interface AlertsPageProps {
  params: Promise<{ locale: string }>;
}

export default async function VendorIntelligenceAlertsPage({
  params,
}: AlertsPageProps) {
  const { userId } = await auth();
  const { locale } = await params;

  if (!userId) {
    redirect("/sign-in");
  }

  return (
    <ClientProviders>
      <div className="flex h-screen bg-background">
        <Sidebar />

        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          <HeaderWithUser
            title="Vendor Intelligence"
            subtitle="Price Alerts"
          />

          <main
            className="flex-1 overflow-auto p-4 sm:p-card-padding pb-24 sm:pb-4"
            style={{ contain: "layout" }}
          >
            <div className="max-w-7xl mx-auto">
              <AlertsClient />
            </div>
          </main>
        </div>
      </div>
    </ClientProviders>
  );
}
