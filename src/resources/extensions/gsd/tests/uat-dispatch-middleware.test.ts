// GSD Extension — UAT Dispatch Middleware Tests
// Unit tests for createUatDispatchMiddleware

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

// Create a .gsd/preferences.md file with optional uat_dispatch
function createPreferencesFile(dir: string, uatDispatch?: boolean): void {
  const gsdDir = join(dir, ".gsd");
  mkdirSync(gsdDir, { recursive: true });
  const prefsPath = join(gsdDir, "preferences.md");
  const content = uatDispatch !== undefined
    ? `---\nuat_dispatch: ${uatDispatch}\n---`
    : `---\n---`;
  writeFileSync(prefsPath, content);
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

Test milestone for UAT dispatch.

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

// Create a slice directory with UAT file
function createSliceWithUat(dir: string, mid: string, sliceId: string, uatType: string): void {
  const sliceDir = join(dir, ".gsd", "milestones", mid, "slices", sliceId);
  mkdirSync(sliceDir, { recursive: true });
  const uatPath = join(sliceDir, `${sliceId}-UAT.md`);

  const uatContent = `# ${sliceId} UAT

## UAT Type

- UAT mode: ${uatType}

## Description

Test UAT for ${sliceId}.
`;
  writeFileSync(uatPath, uatContent);
}

// Create a slice directory with UAT-RESULT file (to simulate completed UAT)
function createSliceWithUatResult(dir: string, mid: string, sliceId: string): void {
  const sliceDir = join(dir, ".gsd", "milestones", mid, "slices", sliceId);
  mkdirSync(sliceDir, { recursive: true });
  const resultPath = join(sliceDir, `${sliceId}-UAT-RESULT.md`);
  writeFileSync(resultPath, `# ${sliceId} UAT Result

UAT completed successfully.
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

console.log("\n=== UAT Dispatch Middleware Tests ===\n");

// Test 1: should pass through when no UAT is needed (no uat_dispatch preference)
console.log("=== should pass through when no UAT is needed ===");
{
  pendingTests++;
  const { dir, cleanup } = createTestDir();
  createPreferencesFile(dir, false); // uat_dispatch: false
  createMilestoneRoadmap(dir, "M001", [
    { id: "S01", title: "Test Slice", done: true },
    { id: "S02", title: "Next Slice", done: false },
  ]);
  process.chdir(dir);

  import("../middleware/uat-dispatch.js").then(async ({ createUatDispatchMiddleware }) => {
    const middleware = createUatDispatchMiddleware();
    const context = createMockContext(dir);
    let nextCalled = false;
    const next = async () => { nextCalled = true; };

    await middleware(context, next);

    assert(nextCalled, "next() should be called when no UAT is needed");
    assert(context.decision === undefined, "decision should remain undefined");

    process.chdir(originalCwd);
    cleanup();
    pendingTests--;
    if (pendingTests === 0) printSummary();
  });
}

// Test 2: should dispatch run-uat when UAT is needed
console.log("\n=== should dispatch run-uat when UAT is needed ===");
{
  pendingTests++;
  const { dir, cleanup } = createTestDir();
  createPreferencesFile(dir, true); // uat_dispatch: true
  createMilestoneRoadmap(dir, "M001", [
    { id: "S01", title: "Test Slice", done: true },
    { id: "S02", title: "Next Slice", done: false },
  ]);
  createSliceWithUat(dir, "M001", "S01", "artifact-driven");
  process.chdir(dir);

  import("../middleware/uat-dispatch.js").then(async ({ createUatDispatchMiddleware }) => {
    const middleware = createUatDispatchMiddleware();
    const context = createMockContext(dir);
    let nextCalled = false;
    const next = async () => { nextCalled = true; };

    await middleware(context, next);

    assert(!nextCalled, "next() should NOT be called when UAT is needed");
    assertNotUndefined(context.decision, "decision should be set when UAT is needed");
    assertEq(context.decision?.unitType, "run-uat", "decision.unitType should be 'run-uat'");

    process.chdir(originalCwd);
    cleanup();
    pendingTests--;
    if (pendingTests === 0) printSummary();
  });
}

// Test 3: should include uatType in metadata
console.log("\n=== should include uatType in metadata ===");
{
  pendingTests++;
  const { dir, cleanup } = createTestDir();
  createPreferencesFile(dir, true);
  createMilestoneRoadmap(dir, "M001", [
    { id: "S01", title: "Test Slice", done: true },
    { id: "S02", title: "Next Slice", done: false },
  ]);
  createSliceWithUat(dir, "M001", "S01", "live-runtime");
  process.chdir(dir);

  import("../middleware/uat-dispatch.js").then(async ({ createUatDispatchMiddleware }) => {
    const middleware = createUatDispatchMiddleware();
    const context = createMockContext(dir);
    let nextCalled = false;
    const next = async () => { nextCalled = true; };

    await middleware(context, next);

    assertNotUndefined(context.decision?.metadata, "metadata should be present");
    assertEq(context.decision?.metadata?.uatType, "live-runtime", "metadata.uatType should be 'live-runtime'");

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
  createPreferencesFile(dir, true);
  createMilestoneRoadmap(dir, "M001", [
    { id: "S01", title: "Test Slice", done: true },
    { id: "S02", title: "Next Slice", done: false },
  ]);
  createSliceWithUat(dir, "M001", "S01", "artifact-driven");
  process.chdir(dir);

  import("../middleware/uat-dispatch.js").then(async ({ createUatDispatchMiddleware }) => {
    const middleware = createUatDispatchMiddleware();
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
  import("../middleware/uat-dispatch.js").then(({ createUatDispatchMiddleware }) => {
    const middleware = createUatDispatchMiddleware();
    const metadata = (middleware as any).__metadata;
    assertEq(metadata.stage, "dispatch", "default stage should be 'dispatch'");
    assertEq(metadata.name, "uat-dispatch", "default name should be 'uat-dispatch'");
    pendingTests--;
    if (pendingTests === 0) printSummary();
  });
}

// Test 6: should allow custom stage via config
console.log("\n=== should allow custom stage via config ===");
{
  pendingTests++;
  import("../middleware/uat-dispatch.js").then(({ createUatDispatchMiddleware }) => {
    const config: any = { stage: "pre-dispatch", name: "custom-uat-dispatch" };
    const middleware = createUatDispatchMiddleware(config);
    const metadata = (middleware as any).__metadata;
    assertEq(metadata.stage, "pre-dispatch", "custom stage should be 'pre-dispatch'");
    assertEq(metadata.name, "custom-uat-dispatch", "custom name should be used");
    pendingTests--;
    if (pendingTests === 0) printSummary();
  });
}

// Test 7: should pass through when UAT result already exists
console.log("\n=== should pass through when UAT result already exists ===");
{
  pendingTests++;
  const { dir, cleanup } = createTestDir();
  createPreferencesFile(dir, true);
  createMilestoneRoadmap(dir, "M001", [
    { id: "S01", title: "Test Slice", done: true },
    { id: "S02", title: "Next Slice", done: false },
  ]);
  createSliceWithUat(dir, "M001", "S01", "artifact-driven");
  createSliceWithUatResult(dir, "M001", "S01");
  process.chdir(dir);

  import("../middleware/uat-dispatch.js").then(async ({ createUatDispatchMiddleware }) => {
    const middleware = createUatDispatchMiddleware();
    const context = createMockContext(dir);
    let nextCalled = false;
    const next = async () => { nextCalled = true; };

    await middleware(context, next);

    assert(nextCalled, "next() should be called when UAT result already exists");
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
  createPreferencesFile(dir, true);
  process.chdir(dir);

  import("../middleware/uat-dispatch.js").then(async ({ createUatDispatchMiddleware }) => {
    const middleware = createUatDispatchMiddleware();
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
  createPreferencesFile(dir, true);
  createMilestoneRoadmap(dir, "M001", [
    { id: "S01", title: "Test Slice", done: true },
    { id: "S02", title: "Next Slice", done: true },
  ]);
  process.chdir(dir);

  import("../middleware/uat-dispatch.js").then(async ({ createUatDispatchMiddleware }) => {
    const middleware = createUatDispatchMiddleware();
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

  import("../middleware/uat-dispatch.js").then(async ({ createUatDispatchMiddleware }) => {
    const config: any = { enabled: false };
    const middleware = createUatDispatchMiddleware(config);
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

// Test 11: should dispatch with human-experience uatType
console.log("\n=== should dispatch with human-experience uatType ===");
{
  pendingTests++;
  const { dir, cleanup } = createTestDir();
  createPreferencesFile(dir, true);
  createMilestoneRoadmap(dir, "M001", [
    { id: "S01", title: "Test Slice", done: true },
    { id: "S02", title: "Next Slice", done: false },
  ]);
  createSliceWithUat(dir, "M001", "S01", "human-experience");
  process.chdir(dir);

  import("../middleware/uat-dispatch.js").then(async ({ createUatDispatchMiddleware }) => {
    const middleware = createUatDispatchMiddleware();
    const context = createMockContext(dir);
    let nextCalled = false;
    const next = async () => { nextCalled = true; };

    await middleware(context, next);

    assert(!nextCalled, "next() should NOT be called when UAT is needed");
    assertEq(context.decision?.metadata?.uatType, "human-experience", "metadata.uatType should be 'human-experience'");

    process.chdir(originalCwd);
    cleanup();
    pendingTests--;
    if (pendingTests === 0) printSummary();
  });
}

// Test 12: should dispatch with mixed uatType
console.log("\n=== should dispatch with mixed uatType ===");
{
  pendingTests++;
  const { dir, cleanup } = createTestDir();
  createPreferencesFile(dir, true);
  createMilestoneRoadmap(dir, "M001", [
    { id: "S01", title: "Test Slice", done: true },
    { id: "S02", title: "Next Slice", done: false },
  ]);
  createSliceWithUat(dir, "M001", "S01", "mixed");
  process.chdir(dir);

  import("../middleware/uat-dispatch.js").then(async ({ createUatDispatchMiddleware }) => {
    const middleware = createUatDispatchMiddleware();
    const context = createMockContext(dir);
    let nextCalled = false;
    const next = async () => { nextCalled = true; };

    await middleware(context, next);

    assert(!nextCalled, "next() should NOT be called when UAT is needed");
    assertEq(context.decision?.metadata?.uatType, "mixed", "metadata.uatType should be 'mixed'");

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
