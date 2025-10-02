import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from '@clerk/nextjs';
import { ToastProvider } from '@/components/ui/toast';
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FinanSEAL - Financial Co-Pilot",
  description: "Multi-modal financial assistant for Southeast Asian SMEs",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "FinanSEAL"
  }
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: "no",
  themeColor: "#3b82f6"
};

/**
 * Root Layout - Minimal setup for internationalization
 * The actual providers and locale-specific setup are handled in [locale]/layout.tsx
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html>
        <head>
          <link rel="manifest" href="/manifest.json" />
        </head>
        <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gray-900 text-white`}>
          <ToastProvider>
            {children}
          </ToastProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
