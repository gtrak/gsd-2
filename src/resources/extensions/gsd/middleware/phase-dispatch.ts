// GSD Extension — Phase Dispatch Middleware
// Handles dispatching units based on the current phase in the state.
// This middleware runs at Priority 75, after idempotency and budget checks.

import type {
  DispatchContext,
  DispatchDecision,
  MiddlewareConfig,
  DispatchMiddleware,
} from "./types.js";
import {
  buildCompleteSlicePrompt,
  buildResearchMilestonePrompt,
  buildPlanMilestonePrompt,
  buildResearchSlicePrompt,
  buildPlanSlicePrompt,
  buildReplanSlicePrompt,
  buildExecuteTaskPrompt,
  buildCompleteMilestonePrompt,
} from "../auto.js";
import {
  resolveMilestoneFile,
  resolveSliceFile,
} from "../paths.js";
import { loadFile } from "../files.js";

// ─── Constants ─────────────────────────────────────────────────────────────

/**
 * Default priority for phase dispatch middleware.
 * Priority 75 — runs after idempotency (100) and budget ceiling (95) checks.
 */
const DEFAULT_PRIORITY = 75;

// ─── Middleware Factory ────────────────────────────────────────────────────

/**
 * Creates the phase dispatch middleware.
 *
 * This middleware examines the current phase in the working state and dispatches
 * the appropriate unit for processing. It handles all phases except "complete"
 * and "blocked" which are handled separately.
 *
 * Phase dispatch mapping:
 * - "summarizing" → "complete-slice"
 * - "pre-planning" → "research-milestone" or "plan-milestone"
 * - "planning" → "research-slice" or "plan-slice"
 * - "replanning-slice" → "replan-slice"
 * - "executing" → "execute-task"
 * - "completing-milestone" → "complete-milestone"
 *
 * @param config - Optional configuration for the middleware
 * @param config.priority - Priority of the middleware (default: 75)
 * @param config.enabled - Whether the middleware is enabled (default: true)
 * @param config.name - Name of the middleware (default: "phase-dispatch")
 * @returns A DispatchMiddleware function
 *
 * @example
 * ```typescript
 * const middleware = createPhaseDispatchMiddleware({ priority: 75 });
 * ```
 */
export function createPhaseDispatchMiddleware(
  config?: Partial<MiddlewareConfig>,
): DispatchMiddleware {
  const priority = config?.priority ?? DEFAULT_PRIORITY;
  const enabled = config?.enabled ?? true;
  const name = config?.name ?? "phase-dispatch";

  // Return a no-op middleware if disabled
  if (!enabled) {
    return async () => {
      // Disabled middleware does nothing
    };
  }

  const middleware: DispatchMiddleware = async (context, next) => {
    const phase = context.workingState.phase;

    // Pass through for phases handled elsewhere
    if (phase === "complete" || phase === "blocked") {
      await next();
      return;
    }

    // Dispatch based on phase
    switch (phase) {
      case "summarizing": {
        if (await handleSummarizing(context)) return;
        break;
      }
      case "pre-planning": {
        if (await handlePrePlanning(context)) return;
        break;
      }
      case "planning": {
        if (await handlePlanning(context)) return;
        break;
      }
      case "replanning-slice": {
        if (await handleReplanningSlice(context)) return;
        break;
      }
      case "executing": {
        if (await handleExecuting(context)) return;
        break;
      }
      case "completing-milestone": {
        if (await handleCompletingMilestone(context)) return;
        break;
      }
      default:
        // Unknown phase — pass through
        await next();
        return;
    }

    // No decision made — pass through to next middleware
    await next();
  };

  // Attach metadata for identification
  (middleware as DispatchMiddleware & { __metadata?: { name: string; priority: number } }).__metadata = {
    name,
    priority,
  };

  return middleware;
}

// ─── Phase Handler Functions ───────────────────────────────────────────────

/**
 * Handles the "summarizing" phase by dispatching a complete-slice unit.
 *
 * @param context - The dispatch context
 * @returns true if a decision was made, false otherwise
 */
async function handleSummarizing(context: DispatchContext): Promise<boolean> {
  const activeSlice = context.workingState.activeSlice;
  const activeMilestone = context.workingState.activeMilestone;

  // Check prerequisites
  if (!activeSlice || !activeMilestone) {
    return false;
  }

  const mid = activeMilestone.id;
  const midTitle = activeMilestone.title;
  const sid = activeSlice.id;
  const sTitle = activeSlice.title;
  const basePath = context.basePath;

  try {
    const prompt = await buildCompleteSlicePrompt(mid, midTitle, sid, sTitle, basePath);

    context.decision = {
      unitType: "complete-slice",
      unitId: `${mid}/${sid}`,
      prompt,
      metadata: { phase: "summarizing" },
    };

    return true;
  } catch {
    return false;
  }
}

/**
 * Handles the "pre-planning" phase by dispatching either research-milestone
 * or plan-milestone based on whether milestone research exists.
 *
 * @param context - The dispatch context
 * @returns true if a decision was made, false otherwise
 */
async function handlePrePlanning(context: DispatchContext): Promise<boolean> {
  const activeMilestone = context.workingState.activeMilestone;

  // Check prerequisites
  if (!activeMilestone) {
    return false;
  }

  const mid = activeMilestone.id;
  const midTitle = activeMilestone.title;
  const basePath = context.basePath;

  // Check if context exists
  const contextFile = resolveMilestoneFile(basePath, mid, "CONTEXT");
  const hasContext = !!(contextFile && await loadFile(contextFile));

  if (!hasContext) {
    // No context — cannot proceed
    return false;
  }

  // Check if milestone research exists
  const researchFile = resolveMilestoneFile(basePath, mid, "RESEARCH");
  const hasResearch = !!(researchFile && await loadFile(researchFile));

  try {
    if (!hasResearch) {
      // Dispatch research-milestone
      const prompt = await buildResearchMilestonePrompt(mid, midTitle, basePath);

      context.decision = {
        unitType: "research-milestone",
        unitId: mid,
        prompt,
        metadata: { phase: "pre-planning" },
      };
    } else {
      // Dispatch plan-milestone
      const prompt = await buildPlanMilestonePrompt(mid, midTitle, basePath);

      context.decision = {
        unitType: "plan-milestone",
        unitId: mid,
        prompt,
        metadata: { phase: "pre-planning" },
      };
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Handles the "planning" phase by dispatching either research-slice
 * or plan-slice based on whether slice research exists.
 *
 * @param context - The dispatch context
 * @returns true if a decision was made, false otherwise
 */
async function handlePlanning(context: DispatchContext): Promise<boolean> {
  const activeSlice = context.workingState.activeSlice;
  const activeMilestone = context.workingState.activeMilestone;

  // Check prerequisites
  if (!activeSlice || !activeMilestone) {
    return false;
  }

  const mid = activeMilestone.id;
  const midTitle = activeMilestone.title;
  const sid = activeSlice.id;
  const sTitle = activeSlice.title;
  const basePath = context.basePath;

  // Check if slice research exists
  const researchFile = resolveSliceFile(basePath, mid, sid, "RESEARCH");
  const hasResearch = !!(researchFile && await loadFile(researchFile));

  try {
    if (!hasResearch) {
      // Skip slice research for S01 when milestone research already exists
      const milestoneResearchFile = resolveMilestoneFile(basePath, mid, "RESEARCH");
      const hasMilestoneResearch = !!(milestoneResearchFile && await loadFile(milestoneResearchFile));

      if (hasMilestoneResearch && sid === "S01") {
        // Dispatch plan-slice directly
        const prompt = await buildPlanSlicePrompt(mid, midTitle, sid, sTitle, basePath);

        context.decision = {
          unitType: "plan-slice",
          unitId: `${mid}/${sid}`,
          prompt,
          metadata: { phase: "planning" },
        };
      } else {
        // Dispatch research-slice
        const prompt = await buildResearchSlicePrompt(mid, midTitle, sid, sTitle, basePath);

        context.decision = {
          unitType: "research-slice",
          unitId: `${mid}/${sid}`,
          prompt,
          metadata: { phase: "planning" },
        };
      }
    } else {
      // Dispatch plan-slice
      const prompt = await buildPlanSlicePrompt(mid, midTitle, sid, sTitle, basePath);

      context.decision = {
        unitType: "plan-slice",
        unitId: `${mid}/${sid}`,
        prompt,
        metadata: { phase: "planning" },
      };
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Handles the "replanning-slice" phase by dispatching a replan-slice unit.
 *
 * @param context - The dispatch context
 * @returns true if a decision was made, false otherwise
 */
async function handleReplanningSlice(context: DispatchContext): Promise<boolean> {
  const activeSlice = context.workingState.activeSlice;
  const activeMilestone = context.workingState.activeMilestone;

  // Check prerequisites
  if (!activeSlice || !activeMilestone) {
    return false;
  }

  const mid = activeMilestone.id;
  const midTitle = activeMilestone.title;
  const sid = activeSlice.id;
  const sTitle = activeSlice.title;
  const basePath = context.basePath;

  try {
    const prompt = await buildReplanSlicePrompt(mid, midTitle, sid, sTitle, basePath);

    context.decision = {
      unitType: "replan-slice",
      unitId: `${mid}/${sid}`,
      prompt,
      metadata: { phase: "replanning-slice" },
    };

    return true;
  } catch {
    return false;
  }
}

/**
 * Handles the "executing" phase by dispatching an execute-task unit.
 *
 * @param context - The dispatch context
 * @returns true if a decision was made, false otherwise
 */
async function handleExecuting(context: DispatchContext): Promise<boolean> {
  const activeTask = context.workingState.activeTask;
  const activeSlice = context.workingState.activeSlice;
  const activeMilestone = context.workingState.activeMilestone;

  // Check prerequisites
  if (!activeTask || !activeSlice || !activeMilestone) {
    return false;
  }

  const mid = activeMilestone.id;
  const sid = activeSlice.id;
  const sTitle = activeSlice.title;
  const tid = activeTask.id;
  const tTitle = activeTask.title;
  const basePath = context.basePath;

  try {
    const prompt = await buildExecuteTaskPrompt(mid, sid, sTitle, tid, tTitle, basePath);

    context.decision = {
      unitType: "execute-task",
      unitId: `${mid}/${sid}/${tid}`,
      prompt,
      metadata: { phase: "executing" },
    };

    return true;
  } catch {
    return false;
  }
}

/**
 * Handles the "completing-milestone" phase by dispatching a complete-milestone unit.
 *
 * @param context - The dispatch context
 * @returns true if a decision was made, false otherwise
 */
async function handleCompletingMilestone(context: DispatchContext): Promise<boolean> {
  const activeMilestone = context.workingState.activeMilestone;

  // Check prerequisites
  if (!activeMilestone) {
    return false;
  }

  const mid = activeMilestone.id;
  const midTitle = activeMilestone.title;
  const basePath = context.basePath;

  try {
    const prompt = await buildCompleteMilestonePrompt(mid, midTitle, basePath);

    context.decision = {
      unitType: "complete-milestone",
      unitId: mid,
      prompt,
      metadata: { phase: "completing-milestone" },
    };

    return true;
  } catch {
    return false;
  }
}
