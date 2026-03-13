// GSD Extension — Observability Middleware
// Emits observability warnings after a dispatch decision is made.
// This is the last middleware in the chain (Priority 60).

import type {
  DispatchContext,
  MiddlewareConfig,
  DispatchMiddleware,
} from "./types.js";
import { emitObservabilityWarnings } from "../auto.js";

// ─── Constants ─────────────────────────────────────────────────────────────

/**
 * Default priority for observability middleware.
 * Priority 60 to ensure it runs after other middlewares but before dispatch.
 */
const DEFAULT_PRIORITY = 60;

// ─── Middleware Factory ────────────────────────────────────────────────────

/**
 * Creates the observability middleware.
 *
 * This middleware always runs and always calls next() to let other middlewares
 * make decisions. After the middleware chain completes, if a decision was made,
 * it emits observability warnings for the dispatched unit.
 *
 * @param config - Optional configuration for the middleware
 * @param config.priority - Priority of the middleware (default: 60)
 * @param config.enabled - Whether the middleware is enabled (default: true)
 * @param config.name - Name of the middleware (default: "observability")
 * @returns A DispatchMiddleware function
 *
 * @example
 * ```typescript
 * const middleware = createObservabilityMiddleware({ priority: 60 });
 * ```
 */
export function createObservabilityMiddleware(
  config?: Partial<MiddlewareConfig>,
): DispatchMiddleware {
  const priority = config?.priority ?? DEFAULT_PRIORITY;
  const enabled = config?.enabled ?? true;
  const name = config?.name ?? "observability";

  // Return a no-op middleware if disabled
  if (!enabled) {
    return async () => {
      // Disabled middleware does nothing
    };
  }

  const middleware: DispatchMiddleware = async (context, next) => {
    // Always call next() first to let other middlewares run
    await next();

    // After the middleware chain completes, check if a decision was made
    if (context.decision) {
      const { unitType, unitId } = context.decision;
      await emitObservabilityWarnings(context.ctx, unitType, unitId);
    }
  };

  // Attach metadata for identification
  (middleware as DispatchMiddleware & { __metadata?: { name: string; priority: number } }).__metadata = {
    name,
    priority,
  };

  return middleware;
}
