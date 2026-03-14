// GSD Extension — Observability Middleware
// Emits observability warnings after a dispatch decision is made.
// This middleware runs in the "post-dispatch" stage.

import type {
  DispatchContext,
  MiddlewareConfig,
  DispatchMiddleware,
  PipelineStage,
} from "./types.js";
import { emitObservabilityWarnings } from "../auto.js";

// ─── Constants ─────────────────────────────────────────────────────────────

/**
 * Default pipeline stage for observability middleware.
 * Runs in the "post-dispatch" stage for after-effects tracking.
 */
const DEFAULT_STAGE: PipelineStage = "post-dispatch";

// ─── Middleware Factory ────────────────────────────────────────────────────

/**
 * Creates the observability middleware.
 *
 * This middleware always runs and always calls next() to let other middlewares
 * make decisions. After the middleware chain completes, if a decision was made,
 * it emits observability warnings for the dispatched unit.
 *
 * @param config - Optional configuration for the middleware
 * @param config.stage - Pipeline stage of the middleware (default: "post-dispatch")
 * @param config.enabled - Whether the middleware is enabled (default: true)
 * @param config.name - Name of the middleware (default: "observability")
 * @returns A DispatchMiddleware function
 *
 * @example
 * ```typescript
 * const middleware = createObservabilityMiddleware({ stage: "post-dispatch" });
 * ```
 */
export function createObservabilityMiddleware(
  config?: Partial<MiddlewareConfig>,
): DispatchMiddleware {
  const stage = config?.stage ?? DEFAULT_STAGE;
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
  (middleware as DispatchMiddleware & { __metadata?: { name: string; stage: PipelineStage } }).__metadata = {
    name,
    stage,
  };

  return middleware;
}
