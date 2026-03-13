// GSD Extension — Phase Dispatch Middleware Tests
// Unit tests for createPhaseDispatchMiddleware

import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

// Create a .gsd directory structure with minimal files for testing
function createTestGsdStructure(dir: string, mid: string, sid?: string, tid?: string): void {
  const gsdDir = join(dir, ".gsd");
  const milestonesDir = join(gsdDir, "milestones");
  const midDir = join(milestonesDir, mid);
  const slicesDir = join(midDir, "slices");

  mkdirSync(milestonesDir, { recursive: true });
  mkdirSync(midDir, { recursive: true });

  // Create milestone context file
  writeFileSync(join(midDir, `${mid}-CONTEXT.md`), `---
---
# Context
Test context
`);

  if (sid) {
    const sidDir = join(slicesDir, sid);
    mkdirSync(sidDir, { recursive: true });

    // Create slice plan file
    writeFileSync(join(sidDir, `${sid}-PLAN.md`), `---
---
# ${sid}: Test Slice
## Goal
Test goal
## Tasks
- [ ] T01: Test task
`);

    if (tid) {
      const tasksDir = join(sidDir, "tasks");
      mkdirSync(tasksDir, { recursive: true });

      // Create task plan file
      writeFileSync(join(tasksDir, `${tid}-PLAN.md`), `---
---
# ${tid}: Test Task
## Goal
Test goal
## Must-Haves
- Test must-have
`);
    }
  }
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

console.log("\n=== Phase Dispatch Middleware Tests ===\n");

// Test 1: should pass through for complete phase
console.log("=== should pass through for complete phase ===");
{
  pendingTests++;
  const { dir, cleanup } = createTestDir();

  import("../middleware/phase-dispatch.js").then(async ({ createPhaseDispatchMiddleware }) => {
    const middleware = createPhaseDispatchMiddleware();
    const context = createMockContext(dir, "complete");
    let nextCalled = false;
    const next = async () => { nextCalled = true; };

    await middleware(context, next);

    assert(nextCalled, "next() should be called for complete phase");
    assert(context.decision === undefined, "decision should remain undefined");

    cleanup();
    pendingTests--;
    if (pendingTests === 0) printSummary();
  });
}

// Test 2: should pass through for blocked phase
console.log("\n=== should pass through for blocked phase ===");
{
  pendingTests++;
  const { dir, cleanup } = createTestDir();

  import("../middleware/phase-dispatch.js").then(async ({ createPhaseDispatchMiddleware }) => {
    const middleware = createPhaseDispatchMiddleware();
    const context = createMockContext(dir, "blocked");
    let nextCalled = false;
    const next = async () => { nextCalled = true; };

    await middleware(context, next);

    assert(nextCalled, "next() should be called for blocked phase");
    assert(context.decision === undefined, "decision should remain undefined");

    cleanup();
    pendingTests--;
    if (pendingTests === 0) printSummary();
  });
}

// Test 3: should dispatch complete-slice for summarizing phase
console.log("\n=== should dispatch complete-slice for summarizing phase ===");
{
  pendingTests++;
  const { dir, cleanup } = createTestDir();
  createTestGsdStructure(dir, "M001", "S01");

  import("../middleware/phase-dispatch.js").then(async ({ createPhaseDispatchMiddleware }) => {
    const middleware = createPhaseDispatchMiddleware();
    const context = createMockContext(dir, "summarizing");
    let nextCalled = false;
    const next = async () => { nextCalled = true; };

    await middleware(context, next);

    assert(!nextCalled, "next() should NOT be called when decision made");
    assertNotUndefined(context.decision, "decision should be set");
    assertEq(context.decision?.unitType, "complete-slice", "unitType should be 'complete-slice'");
    assertEq(context.decision?.unitId, "M001/S01", "unitId should be 'M001/S01'");
    assert(context.decision?.prompt.length > 0, "prompt should be non-empty");
    assertEq(context.decision?.metadata?.phase, "summarizing", "metadata.phase should be 'summarizing'");

    cleanup();
    pendingTests--;
    if (pendingTests === 0) printSummary();
  });
}

// Test 4: should dispatch research-milestone when no research exists in pre-planning
console.log("\n=== should dispatch research-milestone when no research exists in pre-planning ===");
{
  pendingTests++;
  const { dir, cleanup } = createTestDir();
  createTestGsdStructure(dir, "M001");

  import("../middleware/phase-dispatch.js").then(async ({ createPhaseDispatchMiddleware }) => {
    const middleware = createPhaseDispatchMiddleware();
    const context = createMockContext(dir, "pre-planning");
    let nextCalled = false;
    const next = async () => { nextCalled = true; };

    await middleware(context, next);

    assert(!nextCalled, "next() should NOT be called when decision made");
    assertNotUndefined(context.decision, "decision should be set");
    assertEq(context.decision?.unitType, "research-milestone", "unitType should be 'research-milestone'");
    assertEq(context.decision?.unitId, "M001", "unitId should be 'M001'");
    assert(context.decision?.prompt.length > 0, "prompt should be non-empty");
    assertEq(context.decision?.metadata?.phase, "pre-planning", "metadata.phase should be 'pre-planning'");

    cleanup();
    pendingTests--;
    if (pendingTests === 0) printSummary();
  });
}

// Test 5: should dispatch plan-milestone when research exists in pre-planning
console.log("\n=== should dispatch plan-milestone when research exists in pre-planning ===");
{
  pendingTests++;
  const { dir, cleanup } = createTestDir();
  createTestGsdStructure(dir, "M001");
  // Add research file
  const gsdDir = join(dir, ".gsd", "milestones", "M001");
  writeFileSync(join(gsdDir, "M001-RESEARCH.md"), `---
---
# Research
Test research
`);

  import("../middleware/phase-dispatch.js").then(async ({ createPhaseDispatchMiddleware }) => {
    const middleware = createPhaseDispatchMiddleware();
    const context = createMockContext(dir, "pre-planning");
    let nextCalled = false;
    const next = async () => { nextCalled = true; };

    await middleware(context, next);

    assert(!nextCalled, "next() should NOT be called when decision made");
    assertNotUndefined(context.decision, "decision should be set");
    assertEq(context.decision?.unitType, "plan-milestone", "unitType should be 'plan-milestone'");
    assertEq(context.decision?.unitId, "M001", "unitId should be 'M001'");
    assert(context.decision?.prompt.length > 0, "prompt should be non-empty");
    assertEq(context.decision?.metadata?.phase, "pre-planning", "metadata.phase should be 'pre-planning'");

    cleanup();
    pendingTests--;
    if (pendingTests === 0) printSummary();
  });
}

// Test 6: should dispatch research-slice when no research exists in planning
console.log("\n=== should dispatch research-slice when no research exists in planning ===");
{
  pendingTests++;
  const { dir, cleanup } = createTestDir();
  createTestGsdStructure(dir, "M001", "S01");

  import("../middleware/phase-dispatch.js").then(async ({ createPhaseDispatchMiddleware }) => {
    const middleware = createPhaseDispatchMiddleware();
    const context = createMockContext(dir, "planning");
    let nextCalled = false;
    const next = async () => { nextCalled = true; };

    await middleware(context, next);

    assert(!nextCalled, "next() should NOT be called when decision made");
    assertNotUndefined(context.decision, "decision should be set");
    assertEq(context.decision?.unitType, "research-slice", "unitType should be 'research-slice'");
    assertEq(context.decision?.unitId, "M001/S01", "unitId should be 'M001/S01'");
    assert(context.decision?.prompt.length > 0, "prompt should be non-empty");
    assertEq(context.decision?.metadata?.phase, "planning", "metadata.phase should be 'planning'");

    cleanup();
    pendingTests--;
    if (pendingTests === 0) printSummary();
  });
}

// Test 7: should dispatch plan-slice when research exists in planning
console.log("\n=== should dispatch plan-slice when research exists in planning ===");
{
  pendingTests++;
  const { dir, cleanup } = createTestDir();
  createTestGsdStructure(dir, "M001", "S02");
  // Add slice research file
  const sliceDir = join(dir, ".gsd", "milestones", "M001", "slices", "S02");
  writeFileSync(join(sliceDir, "S02-RESEARCH.md"), `---
---
# Research
Test research
`);

  import("../middleware/phase-dispatch.js").then(async ({ createPhaseDispatchMiddleware }) => {
    const middleware = createPhaseDispatchMiddleware();
    const context = createMockContext(dir, "planning",
      { id: "M001", title: "Test Milestone" },
      { id: "S02", title: "Test Slice 2" }
    );
    let nextCalled = false;
    const next = async () => { nextCalled = true; };

    await middleware(context, next);

    assert(!nextCalled, "next() should NOT be called when decision made");
    assertNotUndefined(context.decision, "decision should be set");
    assertEq(context.decision?.unitType, "plan-slice", "unitType should be 'plan-slice'");
    assertEq(context.decision?.unitId, "M001/S02", "unitId should be 'M001/S02'");
    assert(context.decision?.prompt.length > 0, "prompt should be non-empty");
    assertEq(context.decision?.metadata?.phase, "planning", "metadata.phase should be 'planning'");

    cleanup();
    pendingTests--;
    if (pendingTests === 0) printSummary();
  });
}

// Test 8: should dispatch replan-slice for replanning-slice phase
console.log("\n=== should dispatch replan-slice for replanning-slice phase ===");
{
  pendingTests++;
  const { dir, cleanup } = createTestDir();
  createTestGsdStructure(dir, "M001", "S01");

  import("../middleware/phase-dispatch.js").then(async ({ createPhaseDispatchMiddleware }) => {
    const middleware = createPhaseDispatchMiddleware();
    const context = createMockContext(dir, "replanning-slice");
    let nextCalled = false;
    const next = async () => { nextCalled = true; };

    await middleware(context, next);

    assert(!nextCalled, "next() should NOT be called when decision made");
    assertNotUndefined(context.decision, "decision should be set");
    assertEq(context.decision?.unitType, "replan-slice", "unitType should be 'replan-slice'");
    assertEq(context.decision?.unitId, "M001/S01", "unitId should be 'M001/S01'");
    assert(context.decision?.prompt.length > 0, "prompt should be non-empty");
    assertEq(context.decision?.metadata?.phase, "replanning-slice", "metadata.phase should be 'replanning-slice'");

    cleanup();
    pendingTests--;
    if (pendingTests === 0) printSummary();
  });
}

// Test 9: should dispatch execute-task for executing phase
console.log("\n=== should dispatch execute-task for executing phase ===");
{
  pendingTests++;
  const { dir, cleanup } = createTestDir();
  createTestGsdStructure(dir, "M001", "S01", "T01");

  import("../middleware/phase-dispatch.js").then(async ({ createPhaseDispatchMiddleware }) => {
    const middleware = createPhaseDispatchMiddleware();
    const context = createMockContext(dir, "executing");
    let nextCalled = false;
    const next = async () => { nextCalled = true; };

    await middleware(context, next);

    assert(!nextCalled, "next() should NOT be called when decision made");
    assertNotUndefined(context.decision, "decision should be set");
    assertEq(context.decision?.unitType, "execute-task", "unitType should be 'execute-task'");
    assertEq(context.decision?.unitId, "M001/S01/T01", "unitId should be 'M001/S01/T01'");
    assert(context.decision?.prompt.length > 0, "prompt should be non-empty");
    assertEq(context.decision?.metadata?.phase, "executing", "metadata.phase should be 'executing'");

    cleanup();
    pendingTests--;
    if (pendingTests === 0) printSummary();
  });
}

// Test 10: should dispatch complete-milestone for completing-milestone phase
console.log("\n=== should dispatch complete-milestone for completing-milestone phase ===");
{
  pendingTests++;
  const { dir, cleanup } = createTestDir();
  createTestGsdStructure(dir, "M001");
  // Create milestone roadmap
  const midDir = join(dir, ".gsd", "milestones", "M001");
  writeFileSync(join(midDir, "M001-ROADMAP.md"), `---
---
# M001: Test Milestone
## Vision
Test vision
## Success Criteria
- Test criteria
## Slices
- [x] **S01**: Test Slice
`);
  // Create slice summary
  const sliceDir = join(midDir, "slices", "S01");
  mkdirSync(sliceDir, { recursive: true });
  writeFileSync(join(sliceDir, "S01-SUMMARY.md"), `---
id: S01
parent: M001
milestone: M001
---
# S01: Test Slice
Completed.
`);

  import("../middleware/phase-dispatch.js").then(async ({ createPhaseDispatchMiddleware }) => {
    const middleware = createPhaseDispatchMiddleware();
    const context = createMockContext(dir, "completing-milestone",
      { id: "M001", title: "Test Milestone" },
      null,
      null
    );
    let nextCalled = false;
    const next = async () => { nextCalled = true; };

    await middleware(context, next);

    assert(!nextCalled, "next() should NOT be called when decision made");
    assertNotUndefined(context.decision, "decision should be set");
    assertEq(context.decision?.unitType, "complete-milestone", "unitType should be 'complete-milestone'");
    assertEq(context.decision?.unitId, "M001", "unitId should be 'M001'");
    assert(context.decision?.prompt.length > 0, "prompt should be non-empty");
    assertEq(context.decision?.metadata?.phase, "completing-milestone", "metadata.phase should be 'completing-milestone'");

    cleanup();
    pendingTests--;
    if (pendingTests === 0) printSummary();
  });
}

// Test 11: should use priority 75 by default
console.log("\n=== should use priority 75 by default ===");
{
  pendingTests++;
  import("../middleware/phase-dispatch.js").then(({ createPhaseDispatchMiddleware }) => {
    const middleware = createPhaseDispatchMiddleware();
    const metadata = (middleware as any).__metadata;
    assertEq(metadata.priority, 75, "default priority should be 75");
    assertEq(metadata.name, "phase-dispatch", "default name should be 'phase-dispatch'");
    pendingTests--;
    if (pendingTests === 0) printSummary();
  });
}

// Test 12: should allow custom priority via config
console.log("\n=== should allow custom priority via config ===");
{
  pendingTests++;
  import("../middleware/phase-dispatch.js").then(({ createPhaseDispatchMiddleware }) => {
    const config: any = { priority: 80, name: "custom-phase-dispatch" };
    const middleware = createPhaseDispatchMiddleware(config);
    const metadata = (middleware as any).__metadata;
    assertEq(metadata.priority, 80, "custom priority should be 80");
    assertEq(metadata.name, "custom-phase-dispatch", "custom name should be used");
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
