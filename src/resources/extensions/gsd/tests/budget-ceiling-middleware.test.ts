// GSD Extension — Budget Ceiling Middleware Tests
// Unit tests for createBudgetCeilingMiddleware

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

// Create a .gsd/preferences.md file with optional budget_ceiling
function createPreferencesFile(dir: string, budgetCeiling?: number): void {
  const gsdDir = join(dir, ".gsd");
  mkdirSync(gsdDir, { recursive: true });
  const prefsPath = join(gsdDir, "preferences.md");
  const content = budgetCeiling !== undefined
    ? `---\nbudget_ceiling: ${budgetCeiling}\n---`
    : `---\n---`;
  writeFileSync(prefsPath, content);
}

// Mock ExtensionAPI and ExtensionContext
const mockPi = {} as any;
let notifyMessages: string[] = [];
const mockCtx = {
  ui: {
    notify: (message: string, type: string) => {
      notifyMessages.push(message);
    },
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
  completedKeySet: Set<string> = new Set(),
  pendingDecision?: any,
): any {
  return {
    basePath,
    pi: mockPi,
    ctx: mockCtx,
    state: baseState,
    workingState: { ...baseState },
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

console.log("\n=== Budget Ceiling Middleware Tests ===\n");

// Test 1: should pass through when no budget ceiling is set
console.log("=== should pass through when no budget ceiling is set ===");
{
  pendingTests++;
  const { dir, cleanup } = createTestDir();
  createPreferencesFile(dir);
  process.chdir(dir);

  import("../middleware/budget-ceiling.js").then(async ({ createBudgetCeilingMiddleware }) => {
    const { initMetrics, resetMetrics } = await import("../metrics.js");
    initMetrics(dir);

    const middleware = createBudgetCeilingMiddleware();
    const context = createMockContext(dir);
    let nextCalled = false;
    const next = async () => { nextCalled = true; };

    await middleware(context, next);

    assert(nextCalled, "next() should be called when no budget ceiling is set");
    assert(context.decision === undefined, "decision should remain undefined");

    resetMetrics();
    process.chdir(originalCwd);
    cleanup();
    pendingTests--;
    if (pendingTests === 0) printSummary();
  });
}

// Test 2: should pass through when under budget
console.log("\n=== should pass through when under budget ===");
{
  pendingTests++;
  const { dir, cleanup } = createTestDir();
  createPreferencesFile(dir, 100);
  process.chdir(dir);

  import("../middleware/budget-ceiling.js").then(async ({ createBudgetCeilingMiddleware }) => {
    const { initMetrics, resetMetrics, getLedger } = await import("../metrics.js");
    initMetrics(dir);
    const ledger = getLedger();
    if (ledger) {
      ledger.units = [{
        type: "execute-task", id: "M001/S01/T01", model: "test-model",
        startedAt: Date.now() - 10000, finishedAt: Date.now(),
        tokens: { input: 100, output: 100, cacheRead: 0, cacheWrite: 0, total: 200 },
        cost: 50, toolCalls: 0, assistantMessages: 1, userMessages: 1,
      }];
    }

    const middleware = createBudgetCeilingMiddleware();
    const context = createMockContext(dir);
    let nextCalled = false;
    const next = async () => { nextCalled = true; };

    await middleware(context, next);

    assert(nextCalled, "next() should be called when under budget");
    assert(context.decision === undefined, "decision should remain undefined");

    resetMetrics();
    process.chdir(originalCwd);
    cleanup();
    pendingTests--;
    if (pendingTests === 0) printSummary();
  });
}

// Test 3: should pause when budget ceiling is reached
console.log("\n=== should pause when budget ceiling is reached ===");
{
  pendingTests++;
  const { dir, cleanup } = createTestDir();
  createPreferencesFile(dir, 100);
  process.chdir(dir);

  import("../middleware/budget-ceiling.js").then(async ({ createBudgetCeilingMiddleware }) => {
    const { initMetrics, resetMetrics, getLedger } = await import("../metrics.js");
    initMetrics(dir);
    const ledger = getLedger();
    if (ledger) {
      ledger.units = [{
        type: "execute-task", id: "M001/S01/T01", model: "test-model",
        startedAt: Date.now() - 10000, finishedAt: Date.now(),
        tokens: { input: 100, output: 100, cacheRead: 0, cacheWrite: 0, total: 200 },
        cost: 100, toolCalls: 0, assistantMessages: 1, userMessages: 1,
      }];
    }

    const middleware = createBudgetCeilingMiddleware();
    const context = createMockContext(dir);
    let nextCalled = false;
    const next = async () => { nextCalled = true; };

    await middleware(context, next);

    assert(!nextCalled, "next() should NOT be called when budget ceiling is reached");
    assertNotUndefined(context.decision, "decision should be set when pausing");
    assertEq(context.decision?.unitType, "pause", "decision.unitType should be 'pause'");
    assertEq(context.decision?.unitId, "budget-ceiling", "decision.unitId should be 'budget-ceiling'");

    resetMetrics();
    process.chdir(originalCwd);
    cleanup();
    pendingTests--;
    if (pendingTests === 0) printSummary();
  });
}

// Test 4: should pause when over budget
console.log("\n=== should pause when over budget ===");
{
  pendingTests++;
  const { dir, cleanup } = createTestDir();
  createPreferencesFile(dir, 100);
  process.chdir(dir);

  import("../middleware/budget-ceiling.js").then(async ({ createBudgetCeilingMiddleware }) => {
    const { initMetrics, resetMetrics, getLedger } = await import("../metrics.js");
    initMetrics(dir);
    const ledger = getLedger();
    if (ledger) {
      ledger.units = [{
        type: "execute-task", id: "M001/S01/T01", model: "test-model",
        startedAt: Date.now() - 10000, finishedAt: Date.now(),
        tokens: { input: 100, output: 100, cacheRead: 0, cacheWrite: 0, total: 200 },
        cost: 150, toolCalls: 0, assistantMessages: 1, userMessages: 1,
      }];
    }

    const middleware = createBudgetCeilingMiddleware();
    const context = createMockContext(dir);
    let nextCalled = false;
    const next = async () => { nextCalled = true; };

    await middleware(context, next);

    assert(!nextCalled, "next() should NOT be called when over budget");
    assertNotUndefined(context.decision, "decision should be set when pausing");
    assertEq(context.decision?.unitType, "pause", "decision.unitType should be 'pause'");
    assertEq(context.decision?.unitId, "budget-ceiling", "decision.unitId should be 'budget-ceiling'");

    resetMetrics();
    process.chdir(originalCwd);
    cleanup();
    pendingTests--;
    if (pendingTests === 0) printSummary();
  });
}

// Test 5: should include budget info in metadata when pausing
console.log("\n=== should include budget info in metadata when pausing ===");
{
  pendingTests++;
  const { dir, cleanup } = createTestDir();
  createPreferencesFile(dir, 100);
  process.chdir(dir);

  import("../middleware/budget-ceiling.js").then(async ({ createBudgetCeilingMiddleware }) => {
    const { initMetrics, resetMetrics, getLedger } = await import("../metrics.js");
    initMetrics(dir);
    const ledger = getLedger();
    if (ledger) {
      ledger.units = [{
        type: "execute-task", id: "M001/S01/T01", model: "test-model",
        startedAt: Date.now() - 10000, finishedAt: Date.now(),
        tokens: { input: 100, output: 100, cacheRead: 0, cacheWrite: 0, total: 200 },
        cost: 100, toolCalls: 0, assistantMessages: 1, userMessages: 1,
      }];
    }

    const middleware = createBudgetCeilingMiddleware();
    const context = createMockContext(dir);
    let nextCalled = false;
    const next = async () => { nextCalled = true; };

    await middleware(context, next);

    assertNotUndefined(context.decision?.metadata, "metadata should be present");
    assertEq(context.decision?.metadata?.reason, "budget_ceiling_reached", "metadata.reason should be 'budget_ceiling_reached'");
    assertEq(context.decision?.metadata?.budgetCeiling, 100, "metadata.budgetCeiling should be 100");
    assertEq(context.decision?.metadata?.totalCost, 100, "metadata.totalCost should be 100");

    resetMetrics();
    process.chdir(originalCwd);
    cleanup();
    pendingTests--;
    if (pendingTests === 0) printSummary();
  });
}

// Test 6: should use priority 95 by default
console.log("\n=== should use priority 95 by default ===");
{
  pendingTests++;
  import("../middleware/budget-ceiling.js").then(({ createBudgetCeilingMiddleware }) => {
    const middleware = createBudgetCeilingMiddleware();
    const metadata = (middleware as any).__metadata;
    assertEq(metadata.priority, 95, "default priority should be 95");
    assertEq(metadata.name, "budget-ceiling", "default name should be 'budget-ceiling'");
    pendingTests--;
    if (pendingTests === 0) printSummary();
  });
}

// Test 7: should allow custom priority via config
console.log("\n=== should allow custom priority via config ===");
{
  pendingTests++;
  import("../middleware/budget-ceiling.js").then(({ createBudgetCeilingMiddleware }) => {
    const config: any = { priority: 80, name: "custom-budget-ceiling" };
    const middleware = createBudgetCeilingMiddleware(config);
    const metadata = (middleware as any).__metadata;
    assertEq(metadata.priority, 80, "custom priority should be 80");
    assertEq(metadata.name, "custom-budget-ceiling", "custom name should be used");
    pendingTests--;
    if (pendingTests === 0) printSummary();
  });
}

// Test 8: should be disabled when enabled: false
console.log("\n=== should be disabled when enabled: false ===");
{
  pendingTests++;
  const { dir, cleanup } = createTestDir();

  import("../middleware/budget-ceiling.js").then(async ({ createBudgetCeilingMiddleware }) => {
    const config: any = { enabled: false };
    const middleware = createBudgetCeilingMiddleware(config);
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

// Test 9: PAUSE_DECISION constant structure
console.log("\n=== PAUSE_DECISION constant structure ===");
{
  pendingTests++;
  import("../middleware/budget-ceiling.js").then(({ PAUSE_DECISION }) => {
    assertEq(PAUSE_DECISION.unitType, "pause", "unitType should be 'pause'");
    assertEq(PAUSE_DECISION.unitId, "budget-ceiling", "unitId should be 'budget-ceiling'");
    assertEq(PAUSE_DECISION.prompt, "", "prompt should be empty");
    assertEq(PAUSE_DECISION.metadata?.reason, "budget_ceiling_reached", "metadata.reason should be 'budget_ceiling_reached'");
    pendingTests--;
    if (pendingTests === 0) printSummary();
  });
}

// Test 10: should notify user when pausing
console.log("\n=== should notify user when pausing ===");
{
  pendingTests++;
  const { dir, cleanup } = createTestDir();
  createPreferencesFile(dir, 100);
  process.chdir(dir);

  import("../middleware/budget-ceiling.js").then(async ({ createBudgetCeilingMiddleware }) => {
    const { initMetrics, resetMetrics, getLedger } = await import("../metrics.js");
    initMetrics(dir);
    const ledger = getLedger();
    if (ledger) {
      ledger.units = [{
        type: "execute-task", id: "M001/S01/T01", model: "test-model",
        startedAt: Date.now() - 10000, finishedAt: Date.now(),
        tokens: { input: 100, output: 100, cacheRead: 0, cacheWrite: 0, total: 200 },
        cost: 100, toolCalls: 0, assistantMessages: 1, userMessages: 1,
      }];
    }

    notifyMessages = [];

    const middleware = createBudgetCeilingMiddleware();
    const context = createMockContext(dir);
    let nextCalled = false;
    const next = async () => { nextCalled = true; };

    await middleware(context, next);

    assert(notifyMessages.length > 0, "notify should be called");
    assert(notifyMessages[0].includes("Budget ceiling"), "notification should mention budget ceiling");
    assert(notifyMessages[0].includes("Pausing auto-mode"), "notification should mention pausing");

    resetMetrics();
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
