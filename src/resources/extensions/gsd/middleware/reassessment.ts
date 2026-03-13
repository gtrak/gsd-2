// GSD Extension — Reassessment Middleware
// Dispatches reassess-roadmap after slice completion for adaptive replanning.
// This middleware runs at Priority 80, checking if the last completed slice needs reassessment.

import type {
  DispatchContext,
  DispatchDecision,
  MiddlewareConfig,
  DispatchMiddleware,
} from "./types.js";
import { checkNeedsReassessment, buildReassessRoadmapPrompt } from "../auto.js";

// ─── Constants ─────────────────────────────────────────────────────────────

/**
 * Default priority for reassessment middleware.
 * Priority 80 — runs after UAT dispatch (85), ensuring UAT completes before reassessment.
 */
const DEFAULT_PRIORITY = 80;

// ─── Middleware Factory ────────────────────────────────────────────────────

/**
 * Creates the reassessment middleware.
 *
 * This middleware checks if the most recently completed slice needs reassessment.
 * If reassessment is needed, it dispatches a reassess-roadmap unit with the appropriate prompt.
 * If no reassessment is needed, it passes through to the next middleware.
 *
 * @param config - Optional configuration for the middleware
 * @param config.priority - Priority of the middleware (default: 80)
 * @param config.enabled - Whether the middleware is enabled (default: true)
 * @param config.name - Name of the middleware (default: "reassessment")
 * @returns A DispatchMiddleware function
 *
 * @example
 * ```typescript
 * const middleware = createReassessmentMiddleware({ priority: 80 });
 * ```
 */
export function createReassessmentMiddleware(
  config?: Partial<MiddlewareConfig>,
): DispatchMiddleware {
  const priority = config?.priority ?? DEFAULT_PRIORITY;
  const enabled = config?.enabled ?? true;
  const name = config?.name ?? "reassessment";

  // Return a no-op middleware if disabled
  if (!enabled) {
    return async () => {
      // Disabled middleware does nothing
    };
  }

  const middleware: DispatchMiddleware = async (context, next) => {
    const { basePath, state } = context;

    // Get the current milestone ID from state
    const mid = state.activeMilestone?.id;
    if (!mid) {
      // No active milestone — pass through
      await next();
      return;
    }

    // Check if we need reassessment
    const needsReassess = await checkNeedsReassessment(basePath, mid, state);

    // No reassessment needed — pass through to next middleware
    if (!needsReassess) {
      await next();
      return;
    }

    // Reassessment is needed — extract sliceId
    const { sliceId } = needsReassess;

    // Get the milestone title from state
    const midTitle = state.activeMilestone?.title;
    if (!midTitle) {
      // Should not happen if we have an active milestone, but be safe
      await next();
      return;
    }

    // Build the reassess-roadmap prompt
    const prompt = await buildReassessRoadmapPrompt(mid, midTitle, sliceId, basePath);

    // Set the dispatch decision for reassessment
    const decision: DispatchDecision = {
      unitType: "reassess-roadmap",
      unitId: `${mid}/${sliceId}`,
      prompt,
      metadata: { sliceId },
    };

    context.decision = decision;

    // DO NOT call next() — we're making a decision to dispatch reassessment
  };

  // Attach metadata for identification
  (middleware as DispatchMiddleware & { __metadata?: { name: string; priority: number } }).__metadata = {
    name,
    priority,
  };

  return middleware;
}
