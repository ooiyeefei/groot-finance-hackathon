export const dynamic = "force-dynamic";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Sidebar from "@/components/ui/sidebar";
import HeaderWithUser from "@/components/ui/header-with-user";
import { ClientProviders } from "@/components/providers/client-providers";
import PriceIntelligenceClient from "./price-intelligence-client";

export default async function PriceIntelligencePage() {
  const { userId } = await auth();

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
            subtitle="Price Intelligence"
          />
          <main
            className="flex-1 overflow-auto p-4 sm:p-card-padding pb-24 sm:pb-4"
            style={{ contain: "layout" }}
          >
            <div className="max-w-7xl mx-auto">
              <PriceIntelligenceClient />
            </div>
          </main>
        </div>
      </div>
    </ClientProviders>
  );
}
