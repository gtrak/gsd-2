// GSD Extension — Code Review Middleware
// Handles the code review cycle during the executing phase.
// This middleware runs in the "dispatch" stage.

import type {
  DispatchContext,
  DispatchDecision,
  MiddlewareConfig,
  DispatchMiddleware,
  PipelineStage,
} from "./types.js";
import type { ReviewState } from "../types.js";
import { getReviewState } from "../code-review.js";
import { buildReviewTaskPrompt, buildFixTaskPrompt } from "../auto.js";

// ─── Constants ─────────────────────────────────────────────────────────────

/**
 * Default pipeline stage for code review middleware.
 * Runs in the "dispatch" stage for core dispatch logic.
 */
const DEFAULT_STAGE: PipelineStage = "dispatch";

// ─── Middleware Factory ────────────────────────────────────────────────────

/**
 * Creates the code review middleware.
 *
 * This middleware handles the code review cycle during the executing phase.
 * It checks for pending code reviews and dispatches either a review-task
 * or fix-task based on the review state status.
 *
 * Review cycle flow:
 * - "pending_review" → dispatches "review-task" to perform code review
 * - "fixing" → dispatches "fix-task" to fix identified issues
 *
 * @param config - Optional configuration for the middleware
 * @param config.stage - Pipeline stage of the middleware (default: "dispatch")
 * @param config.enabled - Whether the middleware is enabled (default: true)
 * @param config.name - Name of the middleware (default: "code-review")
 * @returns A DispatchMiddleware function
 *
 * @example
 * ```typescript
 * const middleware = createCodeReviewMiddleware({ stage: "dispatch" });
 * ```
 */
export function createCodeReviewMiddleware(
  config?: Partial<MiddlewareConfig>,
): DispatchMiddleware {
  const stage = config?.stage ?? DEFAULT_STAGE;
  const enabled = config?.enabled ?? true;
  const name = config?.name ?? "code-review";

  // Return a no-op middleware if disabled
  if (!enabled) {
    return async () => {
      // Disabled middleware does nothing
    };
  }

  const middleware: DispatchMiddleware = async (context, next) => {
    const phase = context.workingState.phase;
    const activeTask = context.workingState.activeTask;
    const activeSlice = context.workingState.activeSlice;
    const activeMilestone = context.workingState.activeMilestone;

    // Check if phase is "executing" and activeTask exists
    if (phase !== "executing" || !activeTask || !activeSlice || !activeMilestone) {
      await next();
      return;
    }

    const mid = activeMilestone.id;
    const sid = activeSlice.id;
    const tid = activeTask.id;
    const basePath = context.basePath;

    // Get review state
    const reviewState = getReviewState(basePath, mid, sid, tid);

    // If no review state exists, pass through
    if (!reviewState) {
      await next();
      return;
    }

    // Handle based on review state status
    if (reviewState.status === "pending_review") {
      await dispatchReviewTask(context, mid, sid, tid, basePath);
      return;
    } else if (reviewState.status === "fixing") {
      await dispatchFixTask(context, mid, sid, tid, reviewState, basePath);
      return;
    }

    // Unknown status — pass through
    await next();
  };

  // Attach metadata for identification
  (middleware as DispatchMiddleware & { __metadata?: { name: string; stage: PipelineStage } }).__metadata = {
    name,
    stage,
  };

  return middleware;
}

// ─── Dispatch Helper Functions ─────────────────────────────────────────────

/**
 * Dispatches a review-task for code review.
 *
 * @param context - The dispatch context
 * @param mid - Milestone ID
 * @param sid - Slice ID
 * @param tid - Task ID
 * @param basePath - Base path for the project
 */
async function dispatchReviewTask(
  context: DispatchContext,
  mid: string,
  sid: string,
  tid: string,
  basePath: string,
): Promise<void> {
  const sTitle = context.workingState.activeSlice?.title ?? sid;
  const tTitle = context.workingState.activeTask?.title ?? tid;

  const prompt = await buildReviewTaskPrompt(mid, sid, sTitle, tid, tTitle, basePath);

  const decision: DispatchDecision = {
    unitType: "review-task",
    unitId: `${mid}/${sid}/${tid}`,
    prompt,
    metadata: {
      reviewStatus: "pending_review",
      issueCount: 0,
    },
  };

  context.decision = decision;
}

/**
 * Dispatches a fix-task for code review issues.
 *
 * @param context - The dispatch context
 * @param mid - Milestone ID
 * @param sid - Slice ID
 * @param tid - Task ID
 * @param reviewState - The current review state
 * @param basePath - Base path for the project
 */
async function dispatchFixTask(
  context: DispatchContext,
  mid: string,
  sid: string,
  tid: string,
  reviewState: ReviewState,
  basePath: string,
): Promise<void> {
  const sTitle = context.workingState.activeSlice?.title ?? sid;
  const tTitle = context.workingState.activeTask?.title ?? tid;

  const prompt = await buildFixTaskPrompt(mid, sid, sTitle, tid, tTitle, reviewState, basePath);

  const decision: DispatchDecision = {
    unitType: "fix-task",
    unitId: `${mid}/${sid}/${tid}`,
    prompt,
    metadata: {
      reviewStatus: "fixing",
      issueCount: reviewState.issues.length,
    },
  };

  context.decision = decision;
}
