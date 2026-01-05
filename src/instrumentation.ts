/**
 * Next.js Instrumentation File
 *
 * This file is used to initialize monitoring and observability tools
 * when the Next.js server starts. It runs once per server instance.
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  // Initialize Sentry on the server side
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }

  // Initialize Sentry for edge runtime (middleware, edge API routes)
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

/**
 * This function is called when a request finishes with an unhandled error.
 * Sentry captures errors automatically, but this hook can be used for
 * additional error handling if needed.
 */
export const onRequestError = async (
  err: Error,
  request: {
    path: string;
    method: string;
    headers: { [key: string]: string };
  },
  context: {
    routerKind: "Pages Router" | "App Router";
    routePath: string;
    routeType: "render" | "route" | "action" | "middleware";
    renderSource?: "react-server-components" | "react-server-components-payload" | "server-rendering";
    revalidateReason?: "on-demand" | "stale" | "force-cache";
    serverComponentType?: "not-found" | "redirect" | "forbidden" | "unauthorized";
  }
) => {
  // Sentry automatically captures these errors via the SDK integration
  // This hook is available for custom error handling if needed
  console.error(`[Sentry] Captured error in ${context.routerKind}:`, {
    path: request.path,
    method: request.method,
    routeType: context.routeType,
    error: err.message,
  });
};
