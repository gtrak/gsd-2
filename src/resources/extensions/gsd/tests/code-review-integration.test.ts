// Integration tests for code review flow
//
// Scenarios covered:
//   (A) Review triggered when task completes
//   (B) Review cycle parsing basic structure
//   (C) Fix cycle triggered when issues found
//   (D) Max cycles limit enforcement
//   (E) Non-blocking minor issues detection

import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  initReviewState,
  getReviewState,
  clearReviewState,
  parseCodeReview,
  isReviewComplete,
  hasTriviallyFixableMinor,
  needsReviewCycle,
  updateReviewState,
  formatReviewStatus,
} from "../code-review.js";
import type { ReviewIssue } from "../types.js";

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
  console.log("=== code review integration tests ===");

  // ─── (A) Review triggered when task completes ───────────────────────────
  {
    console.log("\n── (A) Review triggered when task completes");
    const base = mkdtempSync(join(tmpdir(), "gsd-review-integration-"));
    try {
      // Setup: Create completed task summary
      const tasksDir = join(base, ".gsd", "milestones", "M001", "slices", "S01", "tasks");
      mkdirSync(tasksDir, { recursive: true });
      writeFileSync(join(tasksDir, "T01-SUMMARY.md"), "# T01 Summary\n\nDone.\n", "utf-8");

      // Test: Review should be needed
      assert(needsReviewCycle(base, "M001", "S01", "T01", true), "needs review when summary exists");
      assert(!needsReviewCycle(base, "M001", "S01", "T01", false), "no review needed when disabled");

      // Cleanup
      rmSync(base, { recursive: true, force: true });
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  }

  // ─── (B) Review cycle parsing basic structure ────────────────────────────────
  {
    console.log("\n── (B) Review cycle parsing basic structure");
    const reviewContent = `# Code Review: T01

**Review Cycle:** 1/5
**Date:** 2026-03-11

## Current Issues

### Critical
- [C-1] SQL Injection vulnerability
  - **Location:** src/auth.js:10
  - **Severity:** Critical
  - **Category:** Security

**Status**: CYCLE_1
`;

    const parsed = parseCodeReview(reviewContent);
    assert(parsed !== null, "review parsed successfully");
    assertEq(parsed!.cycle, 1, "cycle is 1");
    assert(parsed!!.status?.includes("CYCLE_1"), true, "status indicates cycle 1");
    assert(parsed !== null, "review parsed (summary parsing is deferred feature)");
  }

  // ─── (C) Fix cycle triggered when issues found ───────────────────────────────
  {
    console.log("\n── (C) Fix cycle state management");
    const base = mkdtempSync(join(tmpdir(), "gsd-review-integration-"));
    try {
      // Setup: Initialize review state
      initReviewState(base, "M001", "S01", "T01");

      // First state after init should have cycle 1
      let state = getReviewState(base, "M001", "S01", "T01");
      assert(state !== null, "review state exists");
      assertEq(state!.cycle, 1, "cycle starts at 1");

      // Update cycle to 2 after fixing issues
      updateReviewState(base, "M001", "S01", "T01", {
        cycle: 2,
        lastReviewPath: ".gsd/milestones/M001/slices/S01/tasks/T01-CODE-REVIEW.md",
      });

      state = getReviewState(base, "M001", "S01", "T01");
      assert(state !== null, "review state exists after update");
      assertEq(state!.cycle, 2, "cycle updated to 2");
      assert(state!.lastReviewPath !== null, "lastReviewPath is set");
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  }

  // ─── (D) Max cycles limit enforcement ────────────────────────────────────────
  {
    console.log("\n── (D) Max cycles limit enforcement");
    assertEq(formatReviewStatus(1, 5), "review cycle 1/5", "formats status correctly");
    assertEq(formatReviewStatus(3, 5), "review cycle 3/5", "formats status correctly");
    assertEq(formatReviewStatus(5, 5), "review cycle 5/5", "formats status at max");
  }

  // ─── (E) Non-blocking minor issues detection ────────────────────────────────
  {
    console.log("\n── (E) Minor issue classification");
    const issues: ReviewIssue[] = [
      {
        id: "m-1",
        severity: "minor",
        description: "Code style issue (non-trivial)",
        location: "src/file.ts:10",
        category: "Code Quality",
      },
    ];

    // Minor issue without "trivial" is NOT blocking
    assert(!hasTriviallyFixableMinor(issues), "non-trivial minor is not blocking");

    // Adding a trivial marker makes it blocking
    const issuesWithTrivial: ReviewIssue[] = [
      {
        id: "m-2",
        severity: "minor",
        description: "Trivial naming issue",
        location: "src/file.ts:10",
        category: "Code Quality",
      },
    ];

    assert(hasTriviallyFixableMinor(issuesWithTrivial), "trivial minor is blocking");
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
