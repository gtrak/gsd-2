// GSD Extension — Metrics Middleware
// Tracks timing and performance metrics before and after dispatch.
// This middleware runs in the "post-dispatch" stage.

import type {
  DispatchContext,
  MiddlewareConfig,
  DispatchMiddleware,
  PipelineStage,
} from "./types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Dispatch timing metrics tracked by this middleware.
 */
export interface DispatchMetrics {
  /** Timestamp when dispatch started (milliseconds since epoch) */
  dispatchStartedAt: number;
  /** Timestamp when dispatch completed (milliseconds since epoch) */
  dispatchFinishedAt: number;
  /** Duration of dispatch in milliseconds */
  duration: number;
  /** Type of unit being dispatched (if decision was made) */
  unitType?: string;
  /** ID of unit being dispatched (if decision was made) */
  unitId?: string;
}

/**
 * Metrics extension data stored in workingState.extensions.
 */
export interface MetricsExtensionData {
  /** Dispatch timing metrics */
  dispatch?: DispatchMetrics;
}

// ─── Constants ─────────────────────────────────────────────────────────────

/**
 * Default pipeline stage for metrics middleware.
 * Runs in the "post-dispatch" stage for after-effects tracking.
 */
const DEFAULT_STAGE: PipelineStage = "post-dispatch";

// ─── Middleware Factory ────────────────────────────────────────────────────

/**
 * Creates the metrics middleware.
 *
 * This middleware tracks dispatch timing by recording the start time before
 * calling next() and the end time after next() returns. It calculates the
 * duration and stores the metrics in context.workingState.extensions.metrics.
 * If a decision is made, it also attaches the metrics to the decision metadata.
 *
 * @param config - Optional configuration for the middleware
 * @param config.stage - Pipeline stage of the middleware (default: "post-dispatch")
 * @param config.enabled - Whether the middleware is enabled (default: true)
 * @param config.name - Name of the middleware (default: "metrics")
 * @returns A DispatchMiddleware function
 *
 * @example
 * ```typescript
 * const middleware = createMetricsMiddleware({ stage: "post-dispatch" });
 * ```
 */
export function createMetricsMiddleware(
  config?: Partial<MiddlewareConfig>,
): DispatchMiddleware {
  const stage = config?.stage ?? DEFAULT_STAGE;
  const enabled = config?.enabled ?? true;
  const name = config?.name ?? "metrics";

  // Return a no-op middleware if disabled
  if (!enabled) {
    return async () => {
      // Disabled middleware does nothing
    };
  }

  const middleware: DispatchMiddleware = async (context, next) => {
    // Record dispatch start time
    const dispatchStartedAt = Date.now();

    let error: unknown = undefined;
    try {
      // Call next() to continue the middleware chain
      await next();
    } catch (err) {
      // Capture error but rethrow it
      error = err;
    }

    // Record dispatch end time (always, even if error occurred)
    const dispatchFinishedAt = Date.now();

    // Calculate duration
    const duration = dispatchFinishedAt - dispatchStartedAt;

    // Build metrics data
    const dispatchMetrics: DispatchMetrics = {
      dispatchStartedAt,
      dispatchFinishedAt,
      duration,
    };

    // If a decision was made, include unit info in metrics
    if (context.decision) {
      dispatchMetrics.unitType = context.decision.unitType;
      dispatchMetrics.unitId = context.decision.unitId;

      // Attach metrics to decision metadata
      if (!context.decision.metadata) {
        context.decision.metadata = {};
      }
      context.decision.metadata.metrics = dispatchMetrics;
    }

    // Store metrics in workingState extensions (always, even if error occurred)
    if (!context.workingState.extensions) {
      context.workingState.extensions = {};
    }
    (context.workingState.extensions as Record<string, unknown>).metrics = {
      dispatch: dispatchMetrics,
    };

    // Rethrow error if one occurred
    if (error !== undefined) {
      throw error;
    }
  };

  // Attach metadata for identification
  (middleware as DispatchMiddleware & { __metadata?: { name: string; stage: PipelineStage } }).__metadata = {
    name,
    stage,
  };

  return middleware;
}
