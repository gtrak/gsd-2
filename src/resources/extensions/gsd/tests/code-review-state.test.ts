// Tests for code review state management
//
// Scenarios covered:
//   (A) initReviewState creates REVIEW-STATE.json
//   (B) getReviewState reads state correctly
//   (C) updateReviewState updates cycle and lastReviewPath
//   (D) clearReviewState removes state file
//   (E) parseCodeReview extracts cycle, date, status
//   (F) isReviewComplete checks for Status: line
//   (G) hasTriviallyFixableMinor detects trivial minor issues
//   (H) needsReviewCycle returns true when enabled and task completed

import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  initReviewState,
  getReviewState,
  updateReviewState,
  clearReviewState,
  parseCodeReview,
  isReviewComplete,
  hasTriviallyFixableMinor,
  needsReviewCycle,
  createTestBase,
  cleanupTestBase,
} from "../code-review.ts";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) passed++;
  else {
    failed++;
    console.error(`  FAIL: ${message}`);
  }
}

function assertEq<T>(actual: T, expected: T, message: string): void {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

async function main(): Promise<void> {
  console.log("=== code review state tests ===");

  // ─── (A) initReviewState creates REVIEW-STATE.json ────────────────────────
  {
    console.log("\n── (A) initReviewState creates REVIEW-STATE.json");
    const base = createTestBase();
    try {
      initReviewState(base, "M001", "S01", "T01");
      const stateFile = join(base, ".gsd", "milestones", "M001", "slices", "S01", "tasks", "T01-REVIEW-STATE.json");
      const content = readFileSync(stateFile, "utf-8");
      const parsed = JSON.parse(content);
      assertEq(parsed.cycle, 1, "cycle starts at 1");
      assertEq(parsed.activeTaskId, "T01", "task ID tracked");
      assertEq(parsed.lastReviewPath, null, "lastReviewPath is null initially");
      assert(parsed.issues.length === 0, "issues array is empty");
    } finally {
      cleanupTestBase(base);
    }
  }

  // ─── (B) getReviewState reads state correctly ─────────────────────────────
  {
    console.log("\n── (B) getReviewState reads state correctly");
    const base = createTestBase();
    try {
      initReviewState(base, "M002", "S02", "T02");
      const state = getReviewState(base, "M002", "S02", "T02");
      assert(state !== null, "state is not null");
      assertEq(state!.cycle, 1, "cycle is 1 (from init)");
      assertEq(state!.activeTaskId, "T02", "activeTaskId is T02");
      assertEq(state!.lastReviewPath, null, "lastReviewPath is null");
    } finally {
      cleanupTestBase(base);
    }
  }

  // ─── (C) updateReviewState updates cycle and lastReviewPath ────────────────
  {
    console.log("\n── (C) updateReviewState updates cycle and lastReviewPath");
    const base = createTestBase();
    try {
      initReviewState(base, "M003", "S03", "T03");
      updateReviewState(base, "M003", "S03", "T03", {
        cycle: 2,
        lastReviewPath: ".gsd/milestones/M003/slices/S03/tasks/T03-CODE-REVIEW.md",
      });
      const state = getReviewState(base, "M003", "S03", "T03");
      assertEq(state!.cycle, 2, "cycle updated to 2");
      assert(state!.lastReviewPath !== null, "lastReviewPath is not null");
      assert(state!.lastReviewPath?.includes("CODE-REVIEW.md"), true, "lastReviewPath points to review file");
    } finally {
      cleanupTestBase(base);
    }
  }

  // ─── (D) clearReviewState removes state file ───────────────────────────────
  {
    console.log("\n── (D) clearReviewState removes state file");
    const base = createTestBase();
    try {
      initReviewState(base, "M004", "S04", "T04");
      const stateFile = join(base, ".gsd", "milestones", "M004", "slices", "S04", "tasks", "T04-REVIEW-STATE.json");
      clearReviewState(base, "M004", "S04", "T04");
      let exists = true;
      try {
        readFileSync(stateFile, "utf-8");
      } catch {
        exists = false;
      }
      assert(!exists, "state file was removed");
    } finally {
      cleanupTestBase(base);
    }
  }

  // ─── (E) parseCodeReview extracts cycle, date, status ─────────────────────
  {
    console.log("\n── (E) parseCodeReview extracts cycle, date, status");
    const reviewContent = `# Code Review: T01 - Build Parser

**Review Cycle:** 2/5
**Date:** 2026-03-11

**Status**: ISSUES_RESOLVED
`;
    const parsed = parseCodeReview(reviewContent);
    assert(parsed !== null, "parseCodeReview returns non-null");
    assertEq(parsed!.cycle, 2, "cycle parsed correctly");
    assert(parsed!.date.includes("2026-03-11"), true, "date parsed correctly");
    assertEq(parsed!.status, "ISSUES_RESOLVED", "status parsed correctly");
  }

  // ─── (F) isReviewComplete checks for Status: line ─────────────────────────
  {
    console.log("\n── (F) isReviewComplete checks for Status: line");
    const complete = "# Code Review\n\n**Status: PASS - ISSUES_RESOLVED";
    const incomplete = "# Code Review\n\nNo status here";
    assert(isReviewComplete(complete), "complete review has Status: line");
    assert(!isReviewComplete(incomplete), "incomplete review lacks Status: line");
  }

  // ─── (G) hasTriviallyFixableMinor detects trivial minor issues ────────────
  {
    console.log("\n── (G) hasTriviallyFixableMinor detects trivial minor issues");
    const issuesWithTrivial = [
      { id: "m-1", severity: "minor" as const, description: "Inconsistent naming (trivial fix)", location: "src/file.ts:10", category: "Code Quality" },
      { id: "m-2", severity: "minor" as const, description: "Minor code style issue (trivially fixable)", location: "src/file.ts:20", category: "Code Quality" },
    ];
    const issuesWithoutTrivial = [
      { id: "m-1", severity: "minor" as const, description: "Requires refactoring", location: "src/file.ts:10", category: "Code Quality" },
    ];
    assert(hasTriviallyFixableMinor(issuesWithTrivial), "detects trivial minor issues");
    assert(!hasTriviallyFixableMinor(issuesWithoutTrivial), "returns false when no trivial issues");
  }

  // ─── (H) needsReviewCycle returns true when enabled and task completed ───────
  {
    console.log("\n── (H) needsReviewCycle returns true when enabled and task completed");
    const base = createTestBase();
    try {
      // Create directory structure and summary file
      const tasksDir = join(base, ".gsd", "milestones", "M005", "slices", "S05", "tasks");
      mkdirSync(tasksDir, { recursive: true });
      writeFileSync(join(tasksDir, "T05-SUMMARY.md"), "# Task Summary\n\nDone.", "utf-8");

      assert(needsReviewCycle(base, "M005", "S05", "T05", true), "needs review when enabled and summary exists");
      assert(!needsReviewCycle(base, "M005", "S05", "T05", false), "no review needed when disabled");
      assert(!needsReviewCycle(base, "M005", "S05", undefined, true), "no review needed when no task ID");

      // Remove summary for edge case
      rmSync(join(tasksDir, "T05-SUMMARY.md"));
      assert(!needsReviewCycle(base, "M005", "S05", "T05", true), "no review needed when summary missing");
    } finally {
      cleanupTestBase(base);
    }
  }

  // Results
  console.log("\n========================================");
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  } else {
    console.log("All tests passed ✓");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
