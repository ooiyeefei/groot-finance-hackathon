import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from '@clerk/nextjs';
import { ToastProvider } from '@/components/ui/toast';
import { ThemeProvider } from '@/domains/utilities/components/theme-provider';
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
        variables: {
          // Groot's primary brand color (HSL(221, 83%, 53%) from globals.css --primary)
          colorPrimary: '#4A7CFF',

          // Dark mode background (HSL(220, 16%, 8%) from globals.css --background dark mode)
          colorBackground: '#0F1114',

          // Card/Surface background for better contrast in modals
          colorInputBackground: '#1A1D23',

          // Input text color (white for readability in dark mode)
          colorInputText: '#FFFFFF',

          // Main text color (white for maximum visibility)
          colorText: '#FFFFFF',

          // Secondary/descriptive text (HSL(220, 9%, 46%) from globals.css --muted-foreground)
          colorTextSecondary: '#6C7281',

          // Button text color (white on primary blue)
          colorTextOnPrimaryBackground: '#FFFFFF',

          // Error/danger color (Tailwind red-500 from status colors)
          colorDanger: '#EF4444',

          // Success color (Tailwind green-500 from status colors)
          colorSuccess: '#22C55E',

          // Warning color (Tailwind yellow-500 from status colors)
          colorWarning: '#EAB308',

          // Border color for inputs and cards
          colorBorder: '#27272A',
        },
        elements: {
          // Fix for "Email code to..." button text visibility
          alternativeMethodsBlockButton: {
            color: '#FFFFFF',
            backgroundColor: 'transparent',
            borderColor: '#27272A',
            '&:hover': {
              color: '#FFFFFF',
              backgroundColor: '#1A1D23',
            },
          },
          // Ensure all buttons have visible text
          button: {
            color: '#FFFFFF',
          },
          // OTP input styling with dark theme
          formFieldInput__phoneNumber: {
            backgroundColor: '#1A1D23',
            color: '#FFFFFF',
            borderColor: '#27272A',
            '&:focus': {
              borderColor: '#4A7CFF',
            },
          },
          formFieldInput__emailAddress: {
            backgroundColor: '#1A1D23',
            color: '#FFFFFF',
            borderColor: '#27272A',
            '&:focus': {
              borderColor: '#4A7CFF',
            },
          },
          // OTP code input boxes
          formFieldInput__identifier: {
            backgroundColor: '#1A1D23',
            color: '#FFFFFF',
            borderColor: '#27272A',
            '&:focus': {
              borderColor: '#4A7CFF',
            },
          },
          // General input styling for consistency
          formFieldInput: {
            backgroundColor: '#1A1D23',
            color: '#FFFFFF',
            borderColor: '#27272A',
            '&:focus': {
              borderColor: '#4A7CFF',
            },
          },
          // OTP verification code inputs specifically
          otpCodeFieldInput: {
            backgroundColor: '#1A1D23 !important',
            color: '#FFFFFF !important',
            borderColor: '#27272A !important',
            '&:focus': {
              borderColor: '#4A7CFF !important',
            },
          },
          // Card backgrounds
          card: {
            backgroundColor: '#1A1D23',
            borderColor: '#27272A',
          },
          // Modal backgrounds
          modalContent: {
            backgroundColor: '#1A1D23',
            borderColor: '#27272A',
          },
          // Headers and titles
          headerTitle: {
            color: '#FFFFFF',
          },
          headerSubtitle: {
            color: '#6C7281',
          },
          // Form labels
          formFieldLabel: {
            color: '#FFFFFF',
          },
          // Links
          link: {
            color: '#4A7CFF',
            '&:hover': {
              color: '#6B9AFF',
            },
          },
          // Footer links
          footerActionLink: {
            color: '#4A7CFF',
            '&:hover': {
              color: '#6B9AFF',
            },
          },
        },
      }}
    >
      <html suppressHydrationWarning>
        <head>
          <link rel="icon" href="https://ohxwghdgsuyabgsndfzc.supabase.co/storage/v1/object/public/business-profiles/cc5fdbbc-1459-43ad-9736-3cc65649d23b/logo_1760635116031.png" />
        </head>
        <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}>
          <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            enableSystem
            disableTransitionOnChange
          >
            <ToastProvider>
              {children}
            </ToastProvider>
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
