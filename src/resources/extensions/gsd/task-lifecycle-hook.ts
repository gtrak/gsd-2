// GSD Extension — Task Lifecycle Hook
// Tracks task-level must-haves and validates they're addressed in summaries.
// Implements GSDMiddleware for use with executeMiddlewareChain.

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { promises as fs } from "node:fs";
import { parseTaskPlanMustHaves } from "./files.js";
import type { GSDMiddleware, HookContext } from "./hooks.js";
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

// ─── Task Lifecycle Hook ─────────────────────────────────────────────────────

export class TaskLifecycleHook {
  private basePath: string;
  private pi: ExtensionAPI;
  private ctx: ExtensionContext;

  constructor(basePath: string, pi: ExtensionAPI, ctx: ExtensionContext) {
    this.basePath = basePath;
    this.pi = pi;
    this.ctx = ctx;
  }

  /**
   * Returns this hook as a GSDMiddleware function for registration.
   * Use with registerHook({ name: 'task-lifecycle', middleware: hook.asMiddleware() })
   */
  asMiddleware(): GSDMiddleware {
    return async (context: HookContext, next: () => Promise<void>): Promise<void> => {
      await this.process(context);
      await next();
    };
  }

  /**
   * Process the current state and apply any task lifecycle logic.
   * Called by the middleware for every state transition.
   */
  private async process(context: HookContext): Promise<void> {
    const { workingState } = context;
    const unitType = this.inferUnitType(workingState);

    switch (unitType) {
      case "execute-task":
        await this.handleExecuteTask(context);
        break;

      case "complete-slice":
        await this.handleCompleteSlice(context);
        break;

      case "task-summary":
        await this.handleTaskSummary(context);
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
  private inferUnitType(state: GSDState): string {
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
  private async handleExecuteTask(context: HookContext): Promise<void> {
    const taskPlanPath = context.resolveTaskFile("PLAN");
    if (!taskPlanPath) return;

    const taskPlan = await this.loadTaskPlan(taskPlanPath);
    if (!taskPlan) return;

    const mustHaves = this.parseMustHaves(taskPlan);

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
  private async handleCompleteSlice(context: HookContext): Promise<void> {
    // This will be implemented in Task 2.5
    // For now, it's a placeholder
  }

  /**
   * Handle when a task summary file is written.
   * Validates the summary mentions the must-haves from the task plan.
   */
  private async handleTaskSummary(context: HookContext): Promise<void> {
    const lifecycleData = context.getExtensionData<TaskLifecycleData>("task-lifecycle");
    if (!lifecycleData) return;

    const summaryPath = context.resolveTaskFile("SUMMARY");
    if (!summaryPath) return;

    const summary = await this.loadSummary(summaryPath);
    if (!summary) return;

    const addressed = this.checkSummaryMentionsMustHaves(
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
  private async loadTaskPlan(path: string): Promise<string | null> {
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
  private async loadSummary(path: string): Promise<string | null> {
    // Implementation in Task 2.6
    return null;
  }

  // ─── Parsing ────────────────────────────────────────────────────────────────

 /**
    * Parse must-have items from a task plan.
    * Returns array of must-have items with text and checked status.
    */
  private parseMustHaves(taskPlan: string): MustHaveItem[] {
    return parseTaskPlanMustHaves(taskPlan);
  }

  /**
   * Check if a summary mentions the must-have items.
   * Returns true if all must-haves are sufficiently addressed.
   */
  private checkSummaryMentionsMustHaves(
    mustHaves: MustHaveItem[],
    summary: string
  ): boolean {
    // Implementation in Task 2.5
    return true;
  }

  /**
   * Convert must-have array to human-readable summary string.
   * Format: "- [ ] item text" style with count summary.
   */
  private summarizeMustHaves(mustHaves: MustHaveItem[]): string {
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
}
