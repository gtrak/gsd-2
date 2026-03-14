// GSD Extension — Reassessment Middleware Tests
// Unit tests for createReassessmentMiddleware

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

// Create a milestone directory with a roadmap
function createMilestoneRoadmap(
  dir: string,
  mid: string,
  slices: Array<{ id: string; title: string; done: boolean }>,
): void {
  const milestoneDir = join(dir, ".gsd", "milestones", mid);
  mkdirSync(milestoneDir, { recursive: true });
  const roadmapPath = join(milestoneDir, `${mid}-ROADMAP.md`);

  let roadmapContent = `---
title: "${mid}: Test Milestone"
---

# ${mid}: Test Milestone

## Vision

Test milestone for reassessment.

## Success Criteria

- Test criterion

## Slices

`;
  for (const slice of slices) {
    const checked = slice.done ? "x" : " ";
    // Format: - [x] **ID: Title** `risk:low` `depends:[]`
    roadmapContent += `- [${checked}] **${slice.id}: ${slice.title}** \`risk:low\` \`depends:[]\`\n`;
  }

  roadmapContent += `
## Boundary Map

- **${slices[0]?.id} → ${slices[1]?.id || "terminal"}**:
  - **Produces**: Test output
  - **Consumes**: Test input
`;

  writeFileSync(roadmapPath, roadmapContent);
}

// Create a slice directory with SUMMARY file (required for reassessment)
function createSliceSummary(dir: string, mid: string, sliceId: string): void {
  const sliceDir = join(dir, ".gsd", "milestones", mid, "slices", sliceId);
  mkdirSync(sliceDir, { recursive: true });
  const summaryPath = join(sliceDir, `${sliceId}-SUMMARY.md`);

  const summaryContent = `# ${sliceId} Summary

Slice S01 has been completed.

## Implementation Notes

- Implemented core functionality
- All tests passing
`;
  writeFileSync(summaryPath, summaryContent);
}

// Create a slice directory with ASSESSMENT file (to skip reassessment)
function createSliceAssessment(dir: string, mid: string, sliceId: string): void {
  const sliceDir = join(dir, ".gsd", "milestones", mid, "slices", sliceId);
  mkdirSync(sliceDir, { recursive: true });
  const assessmentPath = join(sliceDir, `${sliceId}-ASSESSMENT.md`);
  writeFileSync(assessmentPath, `# ${sliceId} Assessment

Reassessment completed.
`);
}

// Mock ExtensionAPI and ExtensionContext
const mockPi = {} as any;
const mockCtx = {
  ui: {
    notify: () => {},
  },
} as any;

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
  state: any = baseState,
  completedKeySet: Set<string> = new Set(),
  pendingDecision?: any,
): any {
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
    completedKeySet,
    pendingDecision,
    getCompletedKey: (unitType: string, unitId: string) => `${unitType}/${unitId}`,
    isUnitCompleted: (unitType: string, unitId: string) =>
      completedKeySet.has(`${unitType}/${unitId}`),
  };
}

// Save the original working directory
const originalCwd = process.cwd();

// ─── Tests ─────────────────────────────────────────────────────────────────

console.log("\n=== Reassessment Middleware Tests ===\n");

// Test 1: should pass through when no reassessment is needed
console.log("=== should pass through when no reassessment is needed ===");
{
  pendingTests++;
  const { dir, cleanup } = createTestDir();
  createMilestoneRoadmap(dir, "M001", [
    { id: "S01", title: "Test Slice", done: false },
    { id: "S02", title: "Next Slice", done: false },
  ]);
  process.chdir(dir);

  import("../middleware/reassessment.js").then(async ({ createReassessmentMiddleware }) => {
    const middleware = createReassessmentMiddleware();
    const context = createMockContext(dir);
    let nextCalled = false;
    const next = async () => { nextCalled = true; };

    await middleware(context, next);

    assert(nextCalled, "next() should be called when no reassessment is needed");
    assert(context.decision === undefined, "decision should remain undefined");

    process.chdir(originalCwd);
    cleanup();
    pendingTests--;
    if (pendingTests === 0) printSummary();
  });
}

// Test 2: should dispatch reassess-roadmap when reassessment is needed
console.log("\n=== should dispatch reassess-roadmap when reassessment is needed ===");
{
  pendingTests++;
  const { dir, cleanup } = createTestDir();
  createMilestoneRoadmap(dir, "M001", [
    { id: "S01", title: "Test Slice", done: true },
    { id: "S02", title: "Next Slice", done: false },
  ]);
  createSliceSummary(dir, "M001", "S01");
  process.chdir(dir);

  import("../middleware/reassessment.js").then(async ({ createReassessmentMiddleware }) => {
    const middleware = createReassessmentMiddleware();
    const context = createMockContext(dir);
    let nextCalled = false;
    const next = async () => { nextCalled = true; };

    await middleware(context, next);

    assert(!nextCalled, "next() should NOT be called when reassessment is needed");
    assertNotUndefined(context.decision, "decision should be set when reassessment is needed");
    assertEq(context.decision?.unitType, "reassess-roadmap", "decision.unitType should be 'reassess-roadmap'");

    process.chdir(originalCwd);
    cleanup();
    pendingTests--;
    if (pendingTests === 0) printSummary();
  });
}

// Test 3: should include sliceId in metadata
console.log("\n=== should include sliceId in metadata ===");
{
  pendingTests++;
  const { dir, cleanup } = createTestDir();
  createMilestoneRoadmap(dir, "M001", [
    { id: "S01", title: "Test Slice", done: true },
    { id: "S02", title: "Next Slice", done: false },
  ]);
  createSliceSummary(dir, "M001", "S01");
  process.chdir(dir);

  import("../middleware/reassessment.js").then(async ({ createReassessmentMiddleware }) => {
    const middleware = createReassessmentMiddleware();
    const context = createMockContext(dir);
    let nextCalled = false;
    const next = async () => { nextCalled = true; };

    await middleware(context, next);

    assertNotUndefined(context.decision?.metadata, "metadata should be present");
    assertEq(context.decision?.metadata?.sliceId, "S01", "metadata.sliceId should be 'S01'");

    process.chdir(originalCwd);
    cleanup();
    pendingTests--;
    if (pendingTests === 0) printSummary();
  });
}

// Test 4: should build correct unitId from mid and sliceId
console.log("\n=== should build correct unitId from mid and sliceId ===");
{
  pendingTests++;
  const { dir, cleanup } = createTestDir();
  createMilestoneRoadmap(dir, "M001", [
    { id: "S01", title: "Test Slice", done: true },
    { id: "S02", title: "Next Slice", done: false },
  ]);
  createSliceSummary(dir, "M001", "S01");
  process.chdir(dir);

  import("../middleware/reassessment.js").then(async ({ createReassessmentMiddleware }) => {
    const middleware = createReassessmentMiddleware();
    const context = createMockContext(dir);
    let nextCalled = false;
    const next = async () => { nextCalled = true; };

    await middleware(context, next);

    assertEq(context.decision?.unitId, "M001/S01", "decision.unitId should be 'M001/S01'");

    process.chdir(originalCwd);
    cleanup();
    pendingTests--;
    if (pendingTests === 0) printSummary();
  });
}

// Test 5: should use stage 'dispatch' by default
console.log("\n=== should use stage 'dispatch' by default ===");
{
  pendingTests++;
  import("../middleware/reassessment.js").then(({ createReassessmentMiddleware }) => {
    const middleware = createReassessmentMiddleware();
    const metadata = (middleware as any).__metadata;
    assertEq(metadata.stage, "dispatch", "default stage should be 'dispatch'");
    assertEq(metadata.name, "reassessment", "default name should be 'reassessment'");
    pendingTests--;
    if (pendingTests === 0) printSummary();
  });
}

// Test 6: should allow custom stage via config
console.log("\n=== should allow custom stage via config ===");
{
  pendingTests++;
  import("../middleware/reassessment.js").then(({ createReassessmentMiddleware }) => {
    const config: any = { stage: "post-dispatch", name: "custom-reassessment" };
    const middleware = createReassessmentMiddleware(config);
    const metadata = (middleware as any).__metadata;
    assertEq(metadata.stage, "post-dispatch", "custom stage should be 'post-dispatch'");
    assertEq(metadata.name, "custom-reassessment", "custom name should be used");
    pendingTests--;
    if (pendingTests === 0) printSummary();
  });
}

// Test 7: should pass through when reassessment already exists
console.log("\n=== should pass through when reassessment already exists ===");
{
  pendingTests++;
  const { dir, cleanup } = createTestDir();
  createMilestoneRoadmap(dir, "M001", [
    { id: "S01", title: "Test Slice", done: true },
    { id: "S02", title: "Next Slice", done: false },
  ]);
  createSliceSummary(dir, "M001", "S01");
  createSliceAssessment(dir, "M001", "S01");
  process.chdir(dir);

  import("../middleware/reassessment.js").then(async ({ createReassessmentMiddleware }) => {
    const middleware = createReassessmentMiddleware();
    const context = createMockContext(dir);
    let nextCalled = false;
    const next = async () => { nextCalled = true; };

    await middleware(context, next);

    assert(nextCalled, "next() should be called when assessment already exists");
    assert(context.decision === undefined, "decision should remain undefined");

    process.chdir(originalCwd);
    cleanup();
    pendingTests--;
    if (pendingTests === 0) printSummary();
  });
}

// Test 8: should pass through when no active milestone
console.log("\n=== should pass through when no active milestone ===");
{
  pendingTests++;
  const { dir, cleanup } = createTestDir();
  process.chdir(dir);

  import("../middleware/reassessment.js").then(async ({ createReassessmentMiddleware }) => {
    const middleware = createReassessmentMiddleware();
    const state = { ...baseState, activeMilestone: null };
    const context = createMockContext(dir, state);
    let nextCalled = false;
    const next = async () => { nextCalled = true; };

    await middleware(context, next);

    assert(nextCalled, "next() should be called when no active milestone");
    assert(context.decision === undefined, "decision should remain undefined");

    process.chdir(originalCwd);
    cleanup();
    pendingTests--;
    if (pendingTests === 0) printSummary();
  });
}

// Test 9: should pass through when all slices are done
console.log("\n=== should pass through when all slices are done ===");
{
  pendingTests++;
  const { dir, cleanup } = createTestDir();
  createMilestoneRoadmap(dir, "M001", [
    { id: "S01", title: "Test Slice", done: true },
    { id: "S02", title: "Next Slice", done: true },
  ]);
  process.chdir(dir);

  import("../middleware/reassessment.js").then(async ({ createReassessmentMiddleware }) => {
    const middleware = createReassessmentMiddleware();
    const context = createMockContext(dir);
    let nextCalled = false;
    const next = async () => { nextCalled = true; };

    await middleware(context, next);

    assert(nextCalled, "next() should be called when all slices are done");
    assert(context.decision === undefined, "decision should remain undefined");

    process.chdir(originalCwd);
    cleanup();
    pendingTests--;
    if (pendingTests === 0) printSummary();
  });
}

// Test 10: should be disabled when enabled: false
console.log("\n=== should be disabled when enabled: false ===");
{
  pendingTests++;
  const { dir, cleanup } = createTestDir();

  import("../middleware/reassessment.js").then(async ({ createReassessmentMiddleware }) => {
    const config: any = { enabled: false };
    const middleware = createReassessmentMiddleware(config);
    const context = createMockContext(dir);
    let nextCalled = false;
    const next = async () => { nextCalled = true; };

    await middleware(context, next);

    assert(!nextCalled, "next() should NOT be called when disabled");
    assert(context.decision === undefined, "decision should remain undefined");

    cleanup();
    pendingTests--;
    if (pendingTests === 0) printSummary();
  });
}

// Test 11: should dispatch for last completed slice (not first)
console.log("\n=== should dispatch for last completed slice (not first) ===");
{
  pendingTests++;
  const { dir, cleanup } = createTestDir();
  createMilestoneRoadmap(dir, "M001", [
    { id: "S01", title: "First Slice", done: true },
    { id: "S02", title: "Second Slice", done: true },
    { id: "S03", title: "Third Slice", done: false },
  ]);
  createSliceSummary(dir, "M001", "S01");
  createSliceSummary(dir, "M001", "S02");
  process.chdir(dir);

  import("../middleware/reassessment.js").then(async ({ createReassessmentMiddleware }) => {
    const middleware = createReassessmentMiddleware();
    const context = createMockContext(dir);
    let nextCalled = false;
    const next = async () => { nextCalled = true; };

    await middleware(context, next);

    assert(!nextCalled, "next() should NOT be called when reassessment is needed");
    assertEq(context.decision?.unitId, "M001/S02", "decision.unitId should be for S02 (last completed)");
    assertEq(context.decision?.metadata?.sliceId, "S02", "metadata.sliceId should be 'S02'");

    process.chdir(originalCwd);
    cleanup();
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
