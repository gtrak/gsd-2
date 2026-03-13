/**
 * GSD Code Review State Management
 *
 * Functions for managing code review state and parsing review results.
 */

import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import type { CodeReview, ReviewIssue, ReviewState } from "./types.ts";

// ─── Review State Management ────────────────────────────────────────────────

/**
 * Initialize review state for a task.
 */
export function initReviewState(base: string, mid: string, sid: string, tid: string): void {
  const stateFile = join(base, ".gsd", "milestones", mid, "slices", sid, "tasks", `${tid}-REVIEW-STATE.json`);
  const state: ReviewState = {
    activeTaskId: tid,
    cycle: 1,
    status: 'pending_review',
    issues: [],
    lastReviewPath: null,
  };
  mkdirSync(join(stateFile, ".."), { recursive: true });
  writeFileSync(stateFile, JSON.stringify(state, null, 2), "utf-8");
}

/**
 * Update review state with new data.
 */
export function updateReviewState(base: string, mid: string, sid: string, tid: string, update: Partial<ReviewState>): void {
  const stateFile = join(base, ".gsd", "milestones", mid, "slices", sid, "tasks", `${tid}-REVIEW-STATE.json`);
  const existing = getReviewState(base, mid, sid, tid) ?? {
    activeTaskId: tid,
    cycle: 1,
    status: 'pending_review' as const,
    issues: [],
    lastReviewPath: null,
  };
  const updated = { ...existing, ...update };
  writeFileSync(stateFile, JSON.stringify(updated, null, 2), "utf-8");
}

/**
 * Get review state for a task.
 */
export function getReviewState(base: string, mid: string, sid: string, tid: string): ReviewState | null {
  const stateFile = join(base, ".gsd", "milestones", mid, "slices", sid, "tasks", `${tid}-REVIEW-STATE.json`);
  try {
    const content = readFileSync(stateFile, "utf-8");
    return JSON.parse(content) as ReviewState;
  } catch {
    return null;
  }
}

/**
 * Clear review state for a task.
 */
export function clearReviewState(base: string, mid: string, sid: string, tid: string): void {
  const stateFile = join(base, ".gsd", "milestones", mid, "slices", sid, "tasks", `${tid}-REVIEW-STATE.json`);
  try {
    unlinkSync(stateFile);
  } catch {}
}

// ─── Review Parsing ─────────────────────────────────────────────────────────

/**
 * Parse a CODE-REVIEW.md file.
 */
export function parseCodeReview(content: string): CodeReview | null {
  const lines = content.split("\n");
  const output: Partial<CodeReview> = {};
  const currentIssues: ReviewIssue[] = [];
  let currentSection: "critical" | "major" | "minor" | null = null;

  for (const line of lines) {
    const cycleMatch = line.match(/\*\*Review Cycle:\*\* (\d+)\/5/);
    if (cycleMatch) output.cycle = parseInt(cycleMatch[1], 10);

    const dateMatch = line.match(/\*\*Date:\*\* (.+)/);
    if (dateMatch) output.date = dateMatch[1];

    const taskIdMatch = line.match(/^# Code Review: (\S+) - (.+)/);
    if (taskIdMatch) {
      output.taskId = taskIdMatch[1];
      output.taskTitle = taskIdMatch[2];
    }

    const statusMatch = line.match(/\*\*Status\*\*: (.+)/);
    if (statusMatch) output.status = statusMatch[1];

    // Detect section headers
    if (line.trim() === "### Critical") {
      currentSection = "critical";
      continue;
    }
    if (line.trim() === "### Major") {
      currentSection = "major";
      continue;
    }
    if (line.trim() === "### Minor") {
      currentSection = "minor";
      continue;
    }
    if (line.trim().startsWith("###")) {
      currentSection = null;
      continue;
    }

    // Parse issue lines: "- [C-1] Description" or "- [M-1] Description" or "- [m-1] Description"
    if (currentSection && line.trim().startsWith("- [")) {
      const issueMatch = line.match(/- \[([CMm]-\d+)\] (.+)/);
      if (issueMatch) {
        const id = issueMatch[1].toLowerCase();
        const description = issueMatch[2].trim();
        currentIssues.push({
          id,
          severity: currentSection,
          description,
          location: "",
          category: "",
        });
      }
    }

    // Parse location
    if (line.trim().startsWith("- **Location:**")) {
      const locationMatch = line.match(/- \*\*Location:\*\* (.+)/);
      if (locationMatch && currentIssues.length > 0) {
        currentIssues[currentIssues.length - 1].location = locationMatch[1].trim();
      }
    }

    // Parse category
    if (line.trim().startsWith("- **Category:**")) {
      const categoryMatch = line.match(/- \*\*Category:\*\* (.+)/);
      if (categoryMatch && currentIssues.length > 0) {
        currentIssues[currentIssues.length - 1].category = categoryMatch[1].trim();
      }
    }

    // Parse summary table
    if (line.trim().startsWith("|") && line.includes("Total Open")) {
      const cols = line.split("|").map(c => c.trim());
      if (cols.length >= 6) {
        output.summary = {
          previousFixed: { critical: 0, major: 0, minor: 0 },
          previousRemaining: { critical: 0, major: 0, minor: 0 },
          newIssues: { critical: 0, major: 0, minor: 0 },
          totalOpen: { critical: 0, major: 0, minor: 0 },
        };
        // Parse numbers - simplified for MVP
        // Full implementation would parse each column
      }
    }
  }

  return {
    cycle: output.cycle ?? 1,
    date: output.date ?? "",
    taskId: output.taskId ?? "",
    taskTitle: output.taskTitle ?? "",
    previousIssues: [],
    currentIssues,
    summary: output.summary ?? {
      previousFixed: { critical: 0, major: 0, minor: 0 },
      previousRemaining: { critical: 0, major: 0, minor: 0 },
      newIssues: { critical: 0, major: 0, minor: 0 },
      totalOpen: { critical: 0, major: 0, minor: 0 },
    },
    status: output.status ?? "CYCLE_1",
  } as CodeReview;
}

/**
 * Check if a review is complete (has Status: line).
 */
export function isReviewComplete(reviewContent: string): boolean {
  return reviewContent.includes("**Status:") || reviewContent.includes("**Status**:");
}

/**
 * Check if there are trivially fixable minor issues.
 */
export function hasTriviallyFixableMinor(issues: ReviewIssue[]): boolean {
  return issues.some(i =>
    i.severity === 'minor' &&
    (i.description.toLowerCase().includes('trivial') ||
     i.description.toLowerCase().includes('trivially fixable')) &&
    !i.description.toLowerCase().includes('non-trivial') &&
    !i.description.toLowerCase().includes('non trivial')
  );
}

/**
 * Find the most recently completed task for a slice.
 */
export function findMostRecentCompletedTask(base: string, mid: string, sid: string): string | null {
  const tasksDir = join(base, ".gsd", "milestones", mid, "slices", sid, "tasks");
  try {
    const files = readdirSync(tasksDir);
    const summaryFiles = files.filter(f => f.endsWith("-SUMMARY.md")).sort();

    if (summaryFiles.length === 0) return null;

    // Find the one with the most recent modification time
    let mostRecent: string | null = null;
    let mostRecentTime = 0;

    for (const file of summaryFiles) {
      const filePath = join(tasksDir, file);
      const stats = readFileSync(filePath, "utf-8");
      if (stats.includes("completed_at")) {
        // This is a completed task summary
        const mtime = readFileSync(filePath, "utf-8") as any;
        if (Date.parse(mtime) > mostRecentTime) {
          mostRecentTime = Date.parse(mtime);
          mostRecent = file.replace("-SUMMARY.md", "");
        }
      }
    }

    if (!mostRecent) {
      // Fallback: just use the last one
      mostRecent = summaryFiles[summaryFiles.length - 1].replace("-SUMMARY.md", "");
    }

    return mostRecent;
  } catch {
    return null;
  }
}

/**
 * Check if code review is needed for a task.
 */
export function needsReviewCycle(
  base: string,
  mid: string,
  sid: string,
  tid: string | undefined,
  enabled: boolean,
): boolean {
  if (!enabled) return false;
  if (!tid) return false;

  // Check if task summary exists (task just completed)
  const summaryFile = join(base, ".gsd", "milestones", mid, "slices", sid, "tasks", `${tid}-SUMMARY.md`);
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    readFileSync(summaryFile, "utf-8");
    return true;
  } catch {
    return false;
  }
}

// ─── Test Helpers ───────────────────────────────────────────────────────────

/**
 * Create a temporary base directory for testing.
 */
export function createTestBase(prefix: string = "gsd-review-test-"): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

/**
 * Cleanup a test base directory.
 */
export function cleanupTestBase(base: string): void {
  rmSync(base, { recursive: true, force: true });
}

/**
 * Format review status for display.
 */
export function formatReviewStatus(cycle: number, maxCycles: number): string {
  return `review cycle ${cycle}/${maxCycles}`;
}
