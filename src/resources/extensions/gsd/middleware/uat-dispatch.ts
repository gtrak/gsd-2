// GSD Extension — UAT Dispatch Middleware
// Dispatches UAT after complete-slice merge, before reassessment.
// This middleware runs in the "dispatch" stage.

import type {
  DispatchContext,
  DispatchDecision,
  MiddlewareConfig,
  DispatchMiddleware,
  PipelineStage,
} from "./types.js";
import { loadEffectiveGSDPreferences } from "../preferences.js";
import { resolveSliceFile, relSliceFile } from "../paths.js";
import { loadFile } from "../files.js";
import { checkNeedsRunUat, buildRunUatPrompt } from "../auto.js";

// ─── Constants ─────────────────────────────────────────────────────────────

/**
 * Default pipeline stage for UAT dispatch middleware.
 * Runs in the "dispatch" stage for core dispatch logic.
 */
const DEFAULT_STAGE: PipelineStage = "dispatch";

// ─── Middleware Factory ────────────────────────────────────────────────────

/**
 * Creates the UAT dispatch middleware.
 *
 * This middleware checks if the most recently completed slice needs a UAT run.
 * If UAT is needed, it dispatches a run-uat unit with the appropriate prompt.
 * If no UAT is needed, it passes through to the next middleware.
 *
 * @param config - Optional configuration for the middleware
 * @param config.stage - Pipeline stage of the middleware (default: "dispatch")
 * @param config.enabled - Whether the middleware is enabled (default: true)
 * @param config.name - Name of the middleware (default: "uat-dispatch")
 * @returns A DispatchMiddleware function
 *
 * @example
 * ```typescript
 * const middleware = createUatDispatchMiddleware({ stage: "dispatch" });
 * ```
 */
export function createUatDispatchMiddleware(
  config?: Partial<MiddlewareConfig>,
): DispatchMiddleware {
  const stage = config?.stage ?? DEFAULT_STAGE;
  const enabled = config?.enabled ?? true;
  const name = config?.name ?? "uat-dispatch";

  // Return a no-op middleware if disabled
  if (!enabled) {
    return async () => {
      // Disabled middleware does nothing
    };
  }

  const middleware: DispatchMiddleware = async (context, next) => {
    const { basePath, state } = context;

    // Load preferences to check for uat_dispatch setting
    const prefs = loadEffectiveGSDPreferences()?.preferences;

    // Get the current milestone ID from state
    const mid = state.activeMilestone?.id;
    if (!mid) {
      // No active milestone — pass through
      await next();
      return;
    }

    // Check if we need to run UAT
    const needsRunUat = await checkNeedsRunUat(basePath, mid, state, prefs);

    // No UAT needed — pass through to next middleware
    if (!needsRunUat) {
      await next();
      return;
    }

    // UAT is needed — extract sliceId and uatType
    const { sliceId, uatType } = needsRunUat;

    // Load the UAT file
    const uatFile = resolveSliceFile(basePath, mid, sliceId, "UAT");
    if (!uatFile) {
      // Should not happen if checkNeedsRunUat returned a result, but be safe
      await next();
      return;
    }

    // Load the UAT content
    const uatContent = await loadFile(uatFile);
    if (!uatContent) {
      // Should not happen if checkNeedsRunUat returned a result, but be safe
      await next();
      return;
    }

    // Build the run-uat prompt
    const prompt = await buildRunUatPrompt(
      mid,
      sliceId,
      relSliceFile(basePath, mid, sliceId, "UAT"),
      uatContent,
      basePath,
    );

    // Set the dispatch decision for UAT
    const decision: DispatchDecision = {
      unitType: "run-uat",
      unitId: `${mid}/${sliceId}`,
      prompt,
      metadata: { uatType },
    };

    context.decision = decision;

    // DO NOT call next() — we're making a decision to dispatch UAT
  };

  // Attach metadata for identification
  (middleware as DispatchMiddleware & { __metadata?: { name: string; stage: PipelineStage } }).__metadata = {
    name,
    stage,
  };

  return middleware;
}
