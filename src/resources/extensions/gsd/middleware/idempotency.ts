// GSD Extension — Idempotency Middleware
// Checks if a unit has already been completed and should be skipped.
// This is the first middleware in the chain (pre-validation stage).

import type {
  DispatchContext,
  DispatchDecision,
  MiddlewareConfig,
  DispatchMiddleware,
  PipelineStage,
} from "./types.js";
import { verifyExpectedArtifact, removePersistedKey } from "../auto.js";

// ─── Constants ─────────────────────────────────────────────────────────────

/**
 * Default pipeline stage for idempotency middleware.
 * Runs in pre-validation stage to ensure idempotency checks happen first.
 */
const DEFAULT_STAGE: PipelineStage = "pre-validation";

/**
 * Decision object used to signal that a unit should be skipped
 * because it has already been completed.
 */
export const SKIP_DECISION: DispatchDecision = {
  unitType: "skip",
  unitId: "already-completed",
  prompt: "",
  metadata: { skip: true },
};

// ─── Middleware Factory ────────────────────────────────────────────────────

/**
 * Creates the idempotency middleware.
 *
 * This middleware checks if a unit has already been completed in a prior
 * session. If so, it verifies the expected artifact exists before skipping
 * the unit. If the artifact is missing, it removes the stale completion
 * record and allows the unit to be re-run.
 *
 * @param config - Optional configuration for the middleware
 * @param config.stage - Pipeline stage of the middleware (default: "pre-validation")
 * @param config.enabled - Whether the middleware is enabled (default: true)
 * @param config.name - Name of the middleware (default: "idempotency")
 * @returns A DispatchMiddleware function
 *
 * @example
 * ```typescript
 * const middleware = createIdempotencyMiddleware({ stage: "pre-validation" });
 * ```
 */
export function createIdempotencyMiddleware(
  config?: Partial<MiddlewareConfig>,
): DispatchMiddleware {
  const stage = config?.stage ?? DEFAULT_STAGE;
  const enabled = config?.enabled ?? true;
  const name = config?.name ?? "idempotency";

  // Return a no-op middleware if disabled
  if (!enabled) {
    return async () => {
      // Disabled middleware does nothing
    };
  }

  const middleware: DispatchMiddleware = async (context, next) => {
    // If no pending decision exists, pass through immediately
    if (!context.pendingDecision) {
      await next();
      return;
    }

    // Extract unit information from the pending decision
    const { unitType, unitId } = context.pendingDecision;

    // Check if this unit has already been completed
    if (context.isUnitCompleted(unitType, unitId)) {
      // Generate the idempotency key
      const idempotencyKey = `${unitType}/${unitId}`;

      // Cross-validate: does the expected artifact actually exist?
      const artifactExists = verifyExpectedArtifact(unitType, unitId, context.basePath);

      if (artifactExists) {
        // Artifact exists — skip this unit and advance
        context.ctx.ui.notify(`Skipping unit — already completed. Advancing.`, "info");

        // Set the skip decision to tell the dispatcher to advance
        context.decision = SKIP_DECISION;

        // DO NOT call next() — we're making a decision here
        return;
      } else {
        // Stale completion record — artifact is missing
        // Remove from completed set and re-run
        context.completedKeySet.delete(idempotencyKey);
        removePersistedKey(context.basePath, idempotencyKey);

        context.ctx.ui.notify(
          `Re-running ${unitType} ${unitId} — marked complete but expected artifact missing.`,
          "warning",
        );

        // Call next() to let another middleware decide
        await next();
        return;
      }
    }

    // Unit has not been completed — pass through to next middleware
    await next();
  };

  // Attach metadata for identification
  (middleware as DispatchMiddleware & { __metadata?: { name: string; stage: PipelineStage } }).__metadata = {
    name,
    stage,
  };

  return middleware;
}
