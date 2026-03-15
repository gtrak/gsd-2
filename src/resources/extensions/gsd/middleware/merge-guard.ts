// GSD Extension — Merge Guard Middleware
// Handles the general merge guard logic: if we're on a gsd/MID/SID branch and
// that slice is done (roadmap [x]), merge to main before dispatching the next unit.
// This middleware runs in the "pre-dispatch" stage.

import type {
  DispatchContext,
  DispatchDecision,
  MiddlewareConfig,
  DispatchMiddleware,
  PipelineStage,
} from "./types.js";
import {
  getCurrentBranch,
  parseSliceBranch,
  switchToMain,
  mergeSliceToMain,
  getMainBranch,
} from "../worktree.js";
import { resolveMilestoneFile } from "../paths.js";
import { loadFile, parseRoadmap } from "../files.js";
import { deriveState } from "../state.js";

// ─── Constants ─────────────────────────────────────────────────────────────

/**
 * Default pipeline stage for merge guard middleware.
 * Runs in the "pre-dispatch" stage for guard checks.
 */
const DEFAULT_STAGE: PipelineStage = "pre-dispatch";

/**
 * Decision object used to signal that auto-mode should be stopped
 * because a slice merge failed.
 */
export const MERGE_ERROR_DECISION: DispatchDecision = {
  unitType: "error",
  unitId: "merge-failed",
  prompt: "",
  metadata: {
    reason: "slice_merge_failed",
    error: "",
  },
};

// ─── Middleware Factory ────────────────────────────────────────────────────

/**
 * Creates the merge guard middleware.
 *
 * This middleware checks if we're currently on a slice branch (gsd/MID/SID)
 * and if that slice is marked as done in the roadmap. If so, it merges
 * the slice to main before allowing dispatch to continue.
 *
 * This handles scenarios like:
 * - Normal complete-slice → merge → reassess flow
 * - LLM writes summary during task execution, skipping complete-slice
 * - Doctor post-hook marks everything done, skipping complete-slice
 * - complete-milestone runs on a slice branch (last slice bypass)
 *
 * @param config - Optional configuration for the middleware
 * @param config.stage - Pipeline stage of the middleware (default: "pre-dispatch")
 * @param config.enabled - Whether the middleware is enabled (default: true)
 * @param config.name - Name of the middleware (default: "merge-guard")
 * @returns A DispatchMiddleware function
 *
 * @example
 * ```typescript
 * const middleware = createMergeGuardMiddleware({ stage: "pre-dispatch" });
 * ```
 */
export function createMergeGuardMiddleware(
  config?: Partial<MiddlewareConfig>,
): DispatchMiddleware {
  const stage = config?.stage ?? DEFAULT_STAGE;
  const enabled = config?.enabled ?? true;
  const name = config?.name ?? "merge-guard";

  // Return a no-op middleware if disabled
  if (!enabled) {
    return async () => {
      // Disabled middleware does nothing
    };
  }

  const middleware: DispatchMiddleware = async (context, next) => {
    const basePath = context.basePath;

    // Get current branch
    const currentBranch = getCurrentBranch(basePath);

    // Parse the branch to see if it's a slice branch
    const parsedBranch = parseSliceBranch(currentBranch);

    // If not a slice branch, pass through immediately
    if (!parsedBranch) {
      await next();
      return;
    }

    const branchMid = parsedBranch.milestoneId;
    const branchSid = parsedBranch.sliceId;

    // Get the roadmap file path
    const roadmapFile = resolveMilestoneFile(basePath, branchMid, "ROADMAP");

    // If no roadmap file exists, pass through
    if (!roadmapFile) {
      await next();
      return;
    }

    // Load the roadmap content
    const roadmapContent = await loadFile(roadmapFile);

    // If roadmap content is null/empty, pass through
    if (!roadmapContent) {
      await next();
      return;
    }

    // Parse the roadmap
    const roadmap = parseRoadmap(roadmapContent);

    // Find the slice entry for the current branch
    const sliceEntry = roadmap.slices.find((s) => s.id === branchSid);

    // If slice not found or not done, pass through
    if (!sliceEntry || !sliceEntry.done) {
      await next();
      return;
    }

    // Slice is done — attempt to merge
    try {
      const sliceTitleForMerge = sliceEntry.title || branchSid;

      // Switch to main branch
      switchToMain(basePath);

      // Perform the merge
      const mergeResult = mergeSliceToMain(
        basePath,
        branchMid,
        branchSid,
        sliceTitleForMerge,
      );

      // Get the target branch name
      const targetBranch = getMainBranch(basePath);

      // Notify the user of successful merge
      context.ctx.ui.notify(
        `Merged ${mergeResult.branch} → ${targetBranch}.`,
        "info",
      );

      // Re-derive state from main so downstream logic sees merged state
      const newState = await deriveState(basePath);

      // Update working state with the new state
      context.workingState = newState;

      // Call next() — we modified state, let other middlewares run
      await next();
    } catch (error) {
       const errorMsg = error instanceof Error ? error.message : String(error);

       // Safety net: if mergeSliceToMain failed to clean up (or the error
       // came from switchToMain), ensure the working tree isn't left in a
       // conflicted/dirty merge state. Without this, state derivation reads
       // conflict-marker-filled files, produces a corrupt phase, and
       // dispatch loops forever.
       try {
         const { runGit } = await import("../git-service.js");
         const status = runGit(basePath, ["status", "--porcelain"], {
           allowFailure: true,
         });
         if (
           status &&
           (status.includes("UU ") ||
             status.includes("AA ") ||
             status.includes("UD "))
         ) {
           runGit(basePath, ["reset", "--hard", "HEAD"], { allowFailure: true });
           context.ctx.ui.notify(
             `Cleaned up conflicted merge state after failed squash-merge.`,
             "warning",
           );
         }
       } catch {
         // Best-effort cleanup — ignore any errors
       }

       // Notify the user of the merge failure
       context.ctx.ui.notify(`Slice merge failed — stopping auto-mode. Fix conflicts manually and restart.\n${errorMsg}`, "error");

      // Set the error decision with merge failure metadata
       context.decision = {
         ...MERGE_ERROR_DECISION,
         metadata: {
           ...MERGE_ERROR_DECISION.metadata,
           error: errorMsg,
         },
       };

      // DO NOT call next() — we're making a decision to stop
      return;
    }
  };

  // Attach metadata for identification
  (middleware as DispatchMiddleware & {
    __metadata?: { name: string; stage: PipelineStage };
  }).__metadata = {
    name,
    stage,
  };

  return middleware;
}
