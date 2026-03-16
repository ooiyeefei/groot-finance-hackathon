/**
 * Documents Inbox Page (001-doc-email-forward)
 *
 * "Needs Review" inbox for documents that require manual classification.
 * Shows documents with low AI confidence (<85%) or unknown type.
 */

export const dynamic = "force-dynamic";

import { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Sidebar from "@/components/ui/sidebar";
import HeaderWithUser from "@/components/ui/header-with-user";
import { ClientProviders } from "@/components/providers/client-providers";
import DocumentsInboxClient from "./documents-inbox-client";

export const metadata: Metadata = {
  title: "Documents Inbox | Groot Finance",
  description: "Review and classify forwarded documents",
};

export default async function DocumentsInboxPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  return (
    <ClientProviders>
      <div className="flex h-screen bg-background">
        <Sidebar />
        <div className="flex flex-col flex-1 overflow-hidden">
          <HeaderWithUser title="Documents Inbox" subtitle="Review and classify forwarded documents" />
          <main className="flex-1 overflow-y-auto p-6">
            <DocumentsInboxClient />
          </main>
        </div>
      </div>
    </ClientProviders>
  );
}
