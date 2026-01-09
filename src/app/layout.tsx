import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ToastProvider } from '@/components/ui/toast';
import { ThemeProvider } from '@/domains/utilities/components/theme-provider';
import { WebVitalsReporter } from '@/components/monitoring/web-vitals';
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
  // PWA manifest link (Task T009)
  manifest: "/manifest.json",
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
 * Root Layout - Minimal HTML structure
 *
 * NOTE: ClerkProvider is configured in [locale]/layout.tsx via ClerkProviderWrapper
 * This keeps all Clerk config (appearance, allowedRedirectOrigins) in one place.
 * See: src/components/providers/ClerkProviderWrapper.tsx
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html suppressHydrationWarning>
      <head>
        <link rel="icon" href="https://finanseal-public.s3.us-west-2.amazonaws.com/favicon.svg" type="image/svg+xml" />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}>
        <WebVitalsReporter />
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <ToastProvider>
            {children}
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
