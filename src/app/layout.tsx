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
    <ClerkProvider
      appearance={{
        elements: {
          // OTP input styling - white text and background
          formFieldInput__phoneNumber: {
            backgroundColor: '#ffffff',
            color: '#000000',
            borderColor: '#d1d5db'
          },
          formFieldInput__emailAddress: {
            backgroundColor: '#ffffff',
            color: '#000000',
            borderColor: '#d1d5db'
          },
          // OTP code input boxes
          formFieldInput__identifier: {
            backgroundColor: '#ffffff',
            color: '#000000',
            borderColor: '#d1d5db'
          },
          // General input styling for consistency
          formFieldInput: {
            backgroundColor: '#ffffff',
            color: '#000000',
            borderColor: '#d1d5db'
          },
          // OTP verification code inputs specifically
          otpCodeFieldInput: {
            backgroundColor: '#ffffff !important',
            color: '#000000 !important',
            borderColor: '#d1d5db !important'
          }
        },
        variables: {
          colorBackground: '#1f2937', // Dark background
          colorText: '#ffffff',       // White text
          colorPrimary: '#3b82f6',   // Blue primary
          colorInputBackground: '#ffffff', // White input background
          colorInputText: '#000000'  // Black input text
        }
      }}
    >
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
