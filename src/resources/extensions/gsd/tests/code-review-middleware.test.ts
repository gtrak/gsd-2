// GSD Extension — Code Review Middleware Tests
// Unit tests for createCodeReviewMiddleware

import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { PipelineStage } from "../middleware/types.js";

// Test counters
let passed = 0;
let failed = 0;
let pendingTests = 0;

// ─── Test Helpers ──────────────────────────────────────────────────────────

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${message}`);
  }
}

function assertEq<T>(actual: T, expected: T, message: string): void {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed++;
  } else {
    failed++;
    console.error(
      `  FAIL: ${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

function assertNotUndefined<T>(actual: T, message: string): void {
  if (actual !== undefined) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${message} — expected not undefined, got undefined`);
  }
}

// Create a temporary test directory
function createTestDir(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "gsd-test-"));
  return {
    dir,
    cleanup: () => {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    },
  };
}

// Create a .gsd directory structure with review state for testing
function createTestGsdStructureWithReview(
  dir: string,
  mid: string,
  sid: string,
  tid: string,
  status: "pending_review" | "fixing",
  issueCount: number = 0,
): void {
  const gsdDir = join(dir, ".gsd");
  const milestonesDir = join(gsdDir, "milestones");
  const midDir = join(milestonesDir, mid);
  const slicesDir = join(midDir, "slices");
  const sidDir = join(slicesDir, sid);
  const tasksDir = join(sidDir, "tasks");

  mkdirSync(tasksDir, { recursive: true });

  // Create milestone context file
  writeFileSync(join(midDir, `${mid}-CONTEXT.md`), `---
---
# Context
Test context
`);

  // Create slice plan file
  writeFileSync(join(sidDir, `${sid}-PLAN.md`), `---
---
# ${sid}: Test Slice
## Goal
Test goal
## Tasks
- [ ] ${tid}: Test task
`);

  // Create task plan file
  writeFileSync(join(tasksDir, `${tid}-PLAN.md`), `---
---
# ${tid}: Test Task
## Goal
Test goal
## Must-Haves
- Test must-have
`);

  // Create review state file
  const issues: Array<{ id: string; severity: string; description: string; location: string; category: string }> = [];
  for (let i = 0; i < issueCount; i++) {
    issues.push({
      id: `C-${i + 1}`,
      severity: "critical" as const,
      description: `Test issue ${i + 1}`,
      location: "test.js:1",
      category: "Test Category",
    });
  }

  writeFileSync(
    join(tasksDir, `${tid}-REVIEW-STATE.json`),
    JSON.stringify(
      {
        activeTaskId: tid,
        cycle: 1,
        status,
        issues,
        lastReviewPath: null,
      },
      null,
      2,
    ),
    "utf-8",
  );
}

// Mock ExtensionAPI and ExtensionContext
const mockPi = {} as any;
const mockCtx = {
  ui: {
    notify: () => {},
  },
} as any;

// Base state template
const baseState: any = {
  activeMilestone: { id: "M001", title: "Test Milestone" },
  activeSlice: { id: "S01", title: "Test Slice" },
  activeTask: { id: "T01", title: "Test Task" },
  phase: "executing",
  recentDecisions: [],
  blockers: [],
  nextAction: "test",
  registry: [],
  extensions: {},
};

// Create a mock DispatchContext
function createMockContext(
  basePath: string,
  phase: string,
  activeMilestone?: any,
  activeSlice?: any,
  activeTask?: any,
): any {
  const state = {
    ...baseState,
    phase,
    activeMilestone: activeMilestone ?? baseState.activeMilestone,
    activeSlice: activeSlice ?? baseState.activeSlice,
    activeTask: activeTask ?? baseState.activeTask,
  };

  return {
    basePath,
    pi: mockPi,
    ctx: mockCtx,
    state,
    workingState: { ...state },
    getExtensionData: () => undefined,
    setExtensionData: () => {},
    resolveTaskFile: () => null,
    resolveSliceFile: () => null,
    resolveMilestoneFile: () => null,
    completedKeySet: new Set<string>(),
    getCompletedKey: (unitType: string, unitId: string) => `${unitType}/${unitId}`,
    isUnitCompleted: (unitType: string, unitId: string) => false,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

console.log("\n=== Code Review Middleware Tests ===\n");

// Test 1: should pass through when phase is not executing
console.log("=== should pass through when phase is not executing ===");
{
  pendingTests++;
  const { dir, cleanup } = createTestDir();

  import("../middleware/code-review.js").then(async ({ createCodeReviewMiddleware }) => {
    const middleware = createCodeReviewMiddleware();
    const context = createMockContext(dir, "planning");
    let nextCalled = false;
    const next = async () => { nextCalled = true; };

    await middleware(context, next);

    assert(nextCalled, "next() should be called when phase is not executing");
    assert(context.decision === undefined, "decision should remain undefined");

    cleanup();
    pendingTests--;
    if (pendingTests === 0) printSummary();
  });
}

// Test 2: should pass through when no active task
console.log("\n=== should pass through when no active task ===");
{
  pendingTests++;
  const { dir, cleanup } = createTestDir();

  import("../middleware/code-review.js").then(async ({ createCodeReviewMiddleware }) => {
    const middleware = createCodeReviewMiddleware();
    const context = createMockContext(dir, "executing",
      { id: "M001", title: "Test Milestone" },
      { id: "S01", title: "Test Slice" },
      null
    );
    let nextCalled = false;
    const next = async () => { nextCalled = true; };

    await middleware(context, next);

    assert(nextCalled, "next() should be called when no active task");
    assert(context.decision === undefined, "decision should remain undefined");

    cleanup();
    pendingTests--;
    if (pendingTests === 0) printSummary();
  });
}

// Test 3: should pass through when no review state exists
console.log("\n=== should pass through when no review state exists ===");
{
  pendingTests++;
  const { dir, cleanup } = createTestDir();
  // Create basic structure but no review state
  const gsdDir = join(dir, ".gsd", "milestones", "M001");
  mkdirSync(gsdDir, { recursive: true });
  writeFileSync(join(gsdDir, "M001-CONTEXT.md"), "---\n---\n# Context\nTest\n");

  import("../middleware/code-review.js").then(async ({ createCodeReviewMiddleware }) => {
    const middleware = createCodeReviewMiddleware();
    const context = createMockContext(dir, "executing");
    let nextCalled = false;
    const next = async () => { nextCalled = true; };

    await middleware(context, next);

    assert(nextCalled, "next() should be called when no review state exists");
    assert(context.decision === undefined, "decision should remain undefined");

    cleanup();
    pendingTests--;
    if (pendingTests === 0) printSummary();
  });
}

// Test 4: should dispatch review-task when status is pending_review
console.log("\n=== should dispatch review-task when status is pending_review ===");
{
  pendingTests++;
  const { dir, cleanup } = createTestDir();
  createTestGsdStructureWithReview(dir, "M001", "S01", "T01", "pending_review");

  import("../middleware/code-review.js").then(async ({ createCodeReviewMiddleware }) => {
    const middleware = createCodeReviewMiddleware();
    const context = createMockContext(dir, "executing");
    let nextCalled = false;
    const next = async () => { nextCalled = true; };

    await middleware(context, next);

    assert(!nextCalled, "next() should NOT be called when decision made");
    assertNotUndefined(context.decision, "decision should be set");
    assertEq(context.decision?.unitType, "review-task", "unitType should be 'review-task'");
    assertEq(context.decision?.unitId, "M001/S01/T01", "unitId should be 'M001/S01/T01'");
    assert(context.decision?.prompt.length > 0, "prompt should be non-empty");

    cleanup();
    pendingTests--;
    if (pendingTests === 0) printSummary();
  });
}

// Test 5: should dispatch fix-task when status is fixing
console.log("\n=== should dispatch fix-task when status is fixing ===");
{
  pendingTests++;
  const { dir, cleanup } = createTestDir();
  createTestGsdStructureWithReview(dir, "M001", "S01", "T01", "fixing", 3);

  import("../middleware/code-review.js").then(async ({ createCodeReviewMiddleware }) => {
    const middleware = createCodeReviewMiddleware();
    const context = createMockContext(dir, "executing");
    let nextCalled = false;
    const next = async () => { nextCalled = true; };

    await middleware(context, next);

    assert(!nextCalled, "next() should NOT be called when decision made");
    assertNotUndefined(context.decision, "decision should be set");
    assertEq(context.decision?.unitType, "fix-task", "unitType should be 'fix-task'");
    assertEq(context.decision?.unitId, "M001/S01/T01", "unitId should be 'M001/S01/T01'");
    assert(context.decision?.prompt.length > 0, "prompt should be non-empty");

    cleanup();
    pendingTests--;
    if (pendingTests === 0) printSummary();
  });
}

// Test 6: should pass through when review status is unknown
console.log("\n=== should pass through when review status is unknown ===");
{
  pendingTests++;
  const { dir, cleanup } = createTestDir();
  const gsdDir = join(dir, ".gsd", "milestones", "M001", "slices", "S01", "tasks");
  mkdirSync(gsdDir, { recursive: true });
  writeFileSync(join(dir, ".gsd", "milestones", "M001", "M001-CONTEXT.md"), "---\n---\n# Context\nTest\n");
  writeFileSync(join(gsdDir, "T01-REVIEW-STATE.json"), JSON.stringify({
    activeTaskId: "T01",
    cycle: 1,
    status: "unknown_status" as any,
    issues: [],
    lastReviewPath: null,
  }));

  import("../middleware/code-review.js").then(async ({ createCodeReviewMiddleware }) => {
    const middleware = createCodeReviewMiddleware();
    const context = createMockContext(dir, "executing");
    let nextCalled = false;
    const next = async () => { nextCalled = true; };

    await middleware(context, next);

    assert(nextCalled, "next() should be called when review status is unknown");
    assert(context.decision === undefined, "decision should remain undefined");

    cleanup();
    pendingTests--;
    if (pendingTests === 0) printSummary();
  });
}

// Test 7: should include review metadata in decision
console.log("\n=== should include review metadata in decision ===");
{
  pendingTests++;
  const { dir, cleanup } = createTestDir();
  createTestGsdStructureWithReview(dir, "M001", "S01", "T01", "fixing", 5);

  import("../middleware/code-review.js").then(async ({ createCodeReviewMiddleware }) => {
    const middleware = createCodeReviewMiddleware();
    const context = createMockContext(dir, "executing");
    let nextCalled = false;
    const next = async () => { nextCalled = true; };

    await middleware(context, next);

    assertNotUndefined(context.decision?.metadata, "metadata should be set");
    assertEq(context.decision?.metadata?.reviewStatus, "fixing", "metadata.reviewStatus should be 'fixing'");
    assertEq(context.decision?.metadata?.issueCount, 5, "metadata.issueCount should be 5");

    cleanup();
    pendingTests--;
    if (pendingTests === 0) printSummary();
  });
}

// Test 8: should use stage "dispatch" by default
console.log("\n=== should use stage dispatch by default ===");
{
  pendingTests++;
  import("../middleware/code-review.js").then(({ createCodeReviewMiddleware }) => {
    const middleware = createCodeReviewMiddleware();
    const metadata = (middleware as any).__metadata;
    assertEq(metadata.stage, "dispatch" as PipelineStage, "default stage should be dispatch");
    assertEq(metadata.name, "code-review", "default name should be 'code-review'");
    pendingTests--;
    if (pendingTests === 0) printSummary();
  });
}

// Test 9: should allow custom stage via config
console.log("\n=== should allow custom stage via config ===");
{
  pendingTests++;
  import("../middleware/code-review.js").then(({ createCodeReviewMiddleware }) => {
    const config: any = { stage: "post-dispatch" as PipelineStage, name: "custom-code-review" };
    const middleware = createCodeReviewMiddleware(config);
    const metadata = (middleware as any).__metadata;
    assertEq(metadata.stage, "post-dispatch" as PipelineStage, "custom stage should be post-dispatch");
    assertEq(metadata.name, "custom-code-review", "custom name should be used");
    pendingTests--;
    if (pendingTests === 0) printSummary();
  });
}

// ─── Summary ────────────────────────────────────────────────────────────────

function printSummary(): void {
  console.log("\n" + "=".repeat(70));
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(70));

  if (failed > 0) {
    process.exit(1);
  }
}
