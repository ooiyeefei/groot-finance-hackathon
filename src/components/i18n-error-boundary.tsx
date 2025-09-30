'use client';

import { ErrorBoundary } from 'react-error-boundary';
import { RefreshCw, AlertTriangle, Home } from 'lucide-react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface I18nErrorFallbackProps {
  error: Error;
  resetErrorBoundary: () => void;
}

/**
 * Error Fallback Component for i18n failures
 *
 * Provides a graceful fallback UI when translation loading fails,
 * with options to retry or navigate home.
 */
function I18nErrorFallback({ error, resetErrorBoundary }: I18nErrorFallbackProps) {
  const [isRetrying, setIsRetrying] = useState(false);
  const router = useRouter();

  const handleRetry = async () => {
    setIsRetrying(true);
    // Add a small delay to show loading state
    await new Promise(resolve => setTimeout(resolve, 500));
    setIsRetrying(false);
    resetErrorBoundary();
  };

  const handleGoHome = () => {
    // Use Next.js router for secure navigation instead of direct window.location
    router.push('/en'); // Fallback to English home page
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 text-center">
        <div className="flex justify-center mb-4">
          <AlertTriangle className="h-12 w-12 text-red-500" />
        </div>

        <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          Language Loading Error
        </h1>

        <p className="text-gray-600 dark:text-gray-300 mb-6 text-sm">
          We're having trouble loading the language files for this page.
          This might be due to a network issue or missing translation files.
        </p>

        <div className="space-y-3">
          <button
            onClick={handleRetry}
            disabled={isRetrying}
            className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-md transition-colors duration-200"
          >
            <RefreshCw className={`h-4 w-4 ${isRetrying ? 'animate-spin' : ''}`} />
            <span>{isRetrying ? 'Retrying...' : 'Try Again'}</span>
          </button>

          <button
            onClick={handleGoHome}
            className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-md transition-colors duration-200"
          >
            <Home className="h-4 w-4" />
            <span>Go to Home Page</span>
          </button>
        </div>

        {process.env.NODE_ENV === 'development' && (
          <details className="mt-6 text-left">
            <summary className="text-sm text-gray-500 cursor-pointer hover:text-gray-700">
              Error Details (Development)
            </summary>
            <pre className="mt-2 p-3 bg-gray-100 dark:bg-gray-700 rounded text-xs text-red-600 dark:text-red-400 overflow-auto">
              {error.message}
              {error.stack && `\n\nStack Trace:\n${error.stack}`}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}

interface I18nErrorBoundaryProps {
  children: React.ReactNode;
  fallbackLocale?: string;
}

/**
 * I18n Error Boundary Component
 *
 * Wraps the NextIntlClientProvider to catch and handle translation loading errors.
 * Provides automatic retry functionality and fallback navigation.
 */
export function I18nErrorBoundary({
  children,
  fallbackLocale = 'en'
}: I18nErrorBoundaryProps) {
  const handleError = (error: Error) => {
    // Generate unique error ID for correlation
    const errorId = crypto.randomUUID();

    // Only log safe error message, not full error object
    console.error(`I18n Error: ${error.message}. Correlation ID: ${errorId}`);

    // In development, show full error details
    if (process.env.NODE_ENV === 'development') {
      console.error('Full error details (dev only):', error);
    }

    // In production, send error details to secure monitoring service
    if (typeof window !== 'undefined' && 'gtag' in window) {
      (window as any).gtag('event', 'exception', {
        description: `I18n Error: ${error.message}`,
        error_id: errorId,
        fatal: false,
      });
    }
  };

  const handleReset = () => {
    // Clear any cached translation errors
    if (typeof window !== 'undefined') {
      // Safely parse retry count with validation
      const retryCountStr = sessionStorage.getItem('i18n-retry-count') || '0';
      const retryCount = parseInt(retryCountStr, 10);

      // Validate parsed value is a number and within reasonable bounds
      const validRetryCount = !isNaN(retryCount) && retryCount >= 0 && retryCount <= 10 ? retryCount : 0;

      if (validRetryCount > 2) {
        sessionStorage.removeItem('i18n-retry-count');
        window.location.reload();
      } else {
        sessionStorage.setItem('i18n-retry-count', String(validRetryCount + 1));
      }
    }
  };

  return (
    <ErrorBoundary
      FallbackComponent={I18nErrorFallback}
      onError={handleError}
      onReset={handleReset}
      resetKeys={[fallbackLocale]} // Reset when locale changes
    >
      {children}
    </ErrorBoundary>
  );
}