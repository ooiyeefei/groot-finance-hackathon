/**
 * Convex HTTP Client for MCP Server Lambda
 *
 * Provides HTTP-based access to Convex queries for financial intelligence.
 * Uses the same pattern as document-processor-python but in TypeScript.
 *
 * Security Model: System queries via HTTP API with businessId isolation.
 */

export class ConvexError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = 'ConvexError';
  }
}

export interface ConvexClientConfig {
  convexUrl: string;
  timeout?: number;
}

export class ConvexClient {
  private baseUrl: string;
  private timeout: number;

  constructor(config: ConvexClientConfig) {
    this.baseUrl = config.convexUrl.replace(/\/$/, '');
    this.timeout = config.timeout || 30000;
  }

  /**
   * Call a Convex query function
   */
  async query<T>(functionPath: string, args: Record<string, unknown>): Promise<T> {
    const url = `${this.baseUrl}/api/query`;
    const payload = {
      path: functionPath,
      args,
      format: 'json',
    };

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new ConvexError(`HTTP error: ${response.status} - ${errorText.slice(0, 500)}`, 'HTTP_ERROR');
      }

      const result = await response.json();

      if (result.status === 'error') {
        throw new ConvexError(result.errorMessage || 'Unknown error', 'CONVEX_ERROR');
      }

      return result.value as T;
    } catch (error) {
      if (error instanceof ConvexError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ConvexError('Request timeout', 'TIMEOUT');
      }
      throw new ConvexError(`Request failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'REQUEST_FAILED');
    }
  }

  /**
   * Call a Convex action function
   */
  async action<T>(functionPath: string, args: Record<string, unknown>): Promise<T> {
    const url = `${this.baseUrl}/api/action`;
    const payload = {
      path: functionPath,
      args,
      format: 'json',
    };

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new ConvexError(`HTTP error: ${response.status} - ${errorText.slice(0, 500)}`, 'HTTP_ERROR');
      }

      const result = await response.json();

      if (result.status === 'error') {
        throw new ConvexError(result.errorMessage || 'Unknown error', 'CONVEX_ERROR');
      }

      return result.value as T;
    } catch (error) {
      if (error instanceof ConvexError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ConvexError('Request timeout', 'TIMEOUT');
      }
      throw new ConvexError(`Request failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'REQUEST_FAILED');
    }
  }

  /**
   * Call a Convex mutation function
   */
  async mutation<T>(functionPath: string, args: Record<string, unknown>): Promise<T> {
    const url = `${this.baseUrl}/api/mutation`;
    const payload = {
      path: functionPath,
      args,
      format: 'json',
    };

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new ConvexError(`HTTP error: ${response.status} - ${errorText.slice(0, 500)}`, 'HTTP_ERROR');
      }

      const result = await response.json();

      if (result.status === 'error') {
        throw new ConvexError(result.errorMessage || 'Unknown error', 'CONVEX_ERROR');
      }

      return result.value as T;
    } catch (error) {
      if (error instanceof ConvexError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ConvexError('Request timeout', 'TIMEOUT');
      }
      throw new ConvexError(`Request failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'REQUEST_FAILED');
    }
  }
}

// Singleton instance
let convexClient: ConvexClient | null = null;

export function getConvexClient(): ConvexClient {
  if (!convexClient) {
    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!convexUrl) {
      throw new ConvexError('NEXT_PUBLIC_CONVEX_URL environment variable not set', 'CONFIG_ERROR');
    }
    convexClient = new ConvexClient({ convexUrl });
  }
  return convexClient;
}
