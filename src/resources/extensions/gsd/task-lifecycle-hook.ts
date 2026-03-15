// GSD Extension — Task Lifecycle Middleware
// Tracks task-level must-haves and validates they're addressed in summaries.
// Implements DispatchMiddleware for use with the dispatch middleware chain.

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { promises as fs } from "node:fs";
import { parseTaskPlanMustHaves, countMustHavesMentionedInSummary } from "./files.js";
import type { DispatchMiddleware, MiddlewareConfig, PipelineStage } from "./middleware/types.js";
import type { GSDState } from "./types.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TaskLifecycleData {
  taskId: string;
  mustHaves: MustHaveItem[];
  mustHavesAddressed: boolean;
}

export interface MustHaveItem {
  text: string;
  checked: boolean;
}

// ─── Constants ───────────────────────────────────────────────────────────────

/**
 * Default pipeline stage for task lifecycle middleware.
 * Runs in dispatch stage to track task lifecycle data during dispatch decisions.
 */
const DEFAULT_STAGE: PipelineStage = "dispatch";

// ─── Middleware Factory ─────────────────────────────────────────────────────

/**
 * Configuration for the task lifecycle middleware.
 */
export interface TaskLifecycleMiddlewareConfig {
  basePath: string;
  pi: ExtensionAPI;
  ctx: ExtensionContext;
  stage?: PipelineStage;
  enabled?: boolean;
  name?: string;
}

/**
 * Creates the task lifecycle middleware.
 *
 * This middleware tracks task-level must-haves from task plans and validates
 * that they are addressed in task summaries. It stores lifecycle data in the
 * extension data store for use by other middlewares or the dispatch logic.
 *
 * @param config - Configuration for the middleware
 * @param config.basePath - The base path for the GSD project
 * @param config.pi - The ExtensionAPI instance
 * @param config.ctx - The ExtensionContext instance
 * @param config.stage - Pipeline stage of the middleware (default: "dispatch")
 * @param config.enabled - Whether the middleware is enabled (default: true)
 * @param config.name - Name of the middleware (default: "task-lifecycle")
 * @returns A DispatchMiddleware function
 *
 * @example
 * ```typescript
 * const middleware = createTaskLifecycleMiddleware({
 *   basePath: "/project",
 *   pi: extensionApi,
 *   ctx: extensionContext,
 *   stage: "dispatch"
 * });
 * ```
 */
export function createTaskLifecycleMiddleware(
  config: TaskLifecycleMiddlewareConfig,
): DispatchMiddleware {
  const { basePath, pi, ctx } = config;
  const stage = config.stage ?? DEFAULT_STAGE;
  const enabled = config.enabled ?? true;
  const name = config.name ?? "task-lifecycle";

  // Return a no-op middleware if disabled
  if (!enabled) {
    return async (context, next) => {
      // Disabled middleware passes through
      await next();
    };
  }

  const middleware: DispatchMiddleware = async (context, next) => {
    // Process the current state and apply task lifecycle logic
    await process(context, basePath);
    await next();
  };

  // Attach metadata for identification
  (middleware as DispatchMiddleware & { __metadata?: { name: string; stage: PipelineStage } }).__metadata = {
    name,
    stage,
  };

  return middleware;
}

/**
 * Process the current state and apply any task lifecycle logic.
 * Called by the middleware for every state transition.
 */
async function process(context: Parameters<DispatchMiddleware>[0], basePath: string): Promise<void> {
  const { workingState } = context;
  const unitType = inferUnitType(workingState);

  switch (unitType) {
    case "execute-task":
      await handleExecuteTask(context, basePath);
      break;

    case "complete-slice":
      // This will be implemented in Task 2.5
      // For now, it's a placeholder
      break;

    case "task-summary":
      await handleTaskSummary(context, basePath);
      break;

    default:
      // No task lifecycle handling needed for this unit type
      break;
  }
}

/**
 * Infer the current unit type from the state.
 * This is a heuristic based on activeMilestone, activeSlice, activeTask.
 */
function inferUnitType(state: GSDState): string {
  const mid = state.activeMilestone?.id;
  const sid = state.activeSlice?.id;
  const tid = state.activeTask?.id;

  if (!mid) return "idle";
  if (!sid) return "milestone-level";
  if (!tid) return "slice-level";
  return "execute-task";
}

/**
 * Handle the execute-task unit type.
 * Loads the task plan and extracts must-haves for tracking.
 */
async function handleExecuteTask(context: Parameters<DispatchMiddleware>[0], basePath: string): Promise<void> {
  const taskPlanPath = context.resolveTaskFile("PLAN");
  if (!taskPlanPath) return;

  const taskPlan = await loadTaskPlan(taskPlanPath);
  if (!taskPlan) return;

  const mustHaves = parseMustHaves(taskPlan);

  // Store lifecycle data in extensions
  const lifecycleData: TaskLifecycleData = {
    taskId: context.workingState.activeTask!.id,
    mustHaves,
    mustHavesAddressed: false,
  };

  context.setExtensionData("task-lifecycle", lifecycleData);
}

/**
 * Handle the complete-slice unit type.
 * Validates all task summaries mention their must-haves.
 */
async function handleCompleteSlice(_context: Parameters<DispatchMiddleware>[0], _basePath: string): Promise<void> {
  // This will be implemented in Task 2.5
  // For now, it's a placeholder
}

/**
 * Handle when a task summary file is written.
 * Validates the summary mentions the must-haves from the task plan.
 */
async function handleTaskSummary(context: Parameters<DispatchMiddleware>[0], basePath: string): Promise<void> {
  const lifecycleData = context.getExtensionData<TaskLifecycleData>("task-lifecycle");
  if (!lifecycleData) return;

  const summaryPath = context.resolveTaskFile("SUMMARY");
  if (!summaryPath) return;

  const summary = await loadSummary(summaryPath);
  if (!summary) return;

  const addressed = checkSummaryMentionsMustHaves(
    lifecycleData.mustHaves,
    summary
  );

  // Update lifecycle data with result
  context.setExtensionData("task-lifecycle", {
    ...lifecycleData,
    mustHavesAddressed: addressed,
  });

  // If not all must-haves are addressed, could set a warning or decision
  if (!addressed) {
    // Placeholder for warning logic
    // This could set context.decision to steer back to the task
  }
}

// ─── File Loading ───────────────────────────────────────────────────────────

/**
 * Load a task plan file from disk.
 * Returns null if file doesn't exist or can't be read.
 */
async function loadTaskPlan(path: string): Promise<string | null> {
  try {
    const content = await fs.readFile(path, "utf-8");
    return content;
  } catch (err) {
    // File doesn't exist or can't be read - return null
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    // Log other errors but still return null
    console.error(`Error reading task plan at ${path}:`, err);
    return null;
  }
}

/**
 * Load a task summary file from disk.
 * Returns null if file doesn't exist or can't be read.
 */
async function loadSummary(path: string): Promise<string | null> {
  try {
    const content = await fs.readFile(path, "utf-8");
    return content;
  } catch (err) {
    // File doesn't exist or can't be read - return null
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    // Log other errors but still return null
    console.error(`Error reading summary at ${path}:`, err);
    return null;
  }
}

// ─── Parsing ────────────────────────────────────────────────────────────────

/**
 * Parse must-have items from a task plan.
 * Returns array of must-have items with text and checked status.
 */
function parseMustHaves(taskPlan: string): MustHaveItem[] {
  return parseTaskPlanMustHaves(taskPlan);
}

/**
 * Check if a summary mentions the must-have items.
 * Returns true if all must-haves are sufficiently addressed.
 */
function checkSummaryMentionsMustHaves(
  mustHaves: MustHaveItem[],
  summary: string
): boolean {
  const mentionedCount = countMustHavesMentionedInSummary(mustHaves, summary);
  return mentionedCount === mustHaves.length;
}

/**
 * Convert must-have array to human-readable summary string.
 * Format: "- [ ] item text" style with count summary.
 */
export function summarizeMustHaves(mustHaves: MustHaveItem[]): string {
  if (mustHaves.length === 0) {
    return "No must-haves defined.";
  }

  const lines: string[] = [];
  const checkedCount = mustHaves.filter((m) => m.checked).length;
  const uncheckedCount = mustHaves.length - checkedCount;

  lines.push(`Must-Haves (${checkedCount}/${mustHaves.length} checked):`);
  lines.push("");

  for (const mustHave of mustHaves) {
    const checkbox = mustHave.checked ? "[x]" : "[ ]";
    lines.push(`- ${checkbox} ${mustHave.text}`);
  }

  if (uncheckedCount > 0) {
    lines.push("");
    lines.push(`${uncheckedCount} must-have${uncheckedCount === 1 ? "" : "s"} remaining.`);
  }

  return lines.join("\n");
}
