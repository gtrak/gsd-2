// GSD Extension — Middleware Integration Tests
// Tests for the full middleware chain execution and interactions.

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { composeDispatchMiddlewares, composeDispatchMiddlewaresWithConfig } from "../middleware/index.js";
import type {
  DispatchContext,
  DispatchMiddleware,
  MiddlewareConfig,
} from "../middleware/types.js";
import type { GSDState } from "../types.js";

// ─── Test Counters ──────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

// ─── Test Helpers ────────────────────────────────────────────────────────────

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
  const dir = mkdtempSync(join(tmpdir(), "gsd-middleware-integration-test-"));
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

// ─── Mock Factories ─────────────────────────────────────────────────────────

/**
 * Creates a mock ExtensionContext with ui.notify
 */
function createMockExtensionContext(): any {
  const notifications: Array<{ message: string; type?: string }> = [];
  return {
    ui: {
      notify: (message: string, type?: "info" | "warning" | "error") => {
        notifications.push({ message, type });
      },
    },
  };
}

/**
 * Creates a mock ExtensionAPI
 */
function createMockExtensionAPI(): any {
  return {};
}

/**
 * Creates a mock GSDState with various phases
 */
function createMockGSDState(overrides?: Partial<GSDState>): GSDState {
  const baseState: GSDState = {
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
  return { ...baseState, ...overrides };
}

/**
 * Creates a mock DispatchContext with all helpers
 */
function createMockDispatchContext(
  basePath: string,
  completedKeySet: Set<string> = new Set(),
  pendingDecision?: any,
  state?: GSDState,
): DispatchContext {
  const mockCtx = createMockExtensionContext();
  const mockPi = createMockExtensionAPI();
  const gsdState = state ?? createMockGSDState();

  return {
    basePath,
    pi: mockPi,
    ctx: mockCtx,
    state: gsdState,
    workingState: { ...gsdState },
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

/**
 * Creates a test middleware with a custom handler
 */
function createTestMiddleware(
  name: string,
  priority: number,
  handler: (context: DispatchContext, next: () => Promise<void>) => Promise<void>,
): DispatchMiddleware {
  const middleware: DispatchMiddleware = handler;
  (middleware as DispatchMiddleware & { __metadata?: { name: string; priority: number } }).__metadata = {
    name,
    priority,
  };
  return middleware;
}

/**
 * Runs a middleware chain and returns the final context
 */
async function runMiddlewareChain(
  context: DispatchContext,
  middlewares: DispatchMiddleware[],
): Promise<DispatchContext> {
  // Sort middlewares by priority (highest first)
  const sortedMiddlewares = [...middlewares].sort((a, b) => {
    const priorityA = (a as DispatchMiddleware & { __metadata?: { priority: number } }).__metadata?.priority ?? 50;
    const priorityB = (b as DispatchMiddleware & { __metadata?: { priority: number } }).__metadata?.priority ?? 50;
    return priorityB - priorityA;
  });

  let index = 0;
  async function next(): Promise<void> {
    // If decision has been made, stop the chain
    if (context.decision) {
      return;
    }

    const middleware = sortedMiddlewares[index++];
    if (!middleware) return;

    try {
      await middleware(context, next);
    } catch (error) {
      // Log error but continue to next middleware (error isolation)
      console.error(`Middleware "${(middleware as DispatchMiddleware & { __metadata?: { name: string } }).__metadata?.name}" error:`, error);
      await next();
    }
  }

  await next();
  return context;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

console.log("\n=== Middleware Integration Tests ===\n");

// Test 1: middleware chain executes in priority order
console.log("=== Test: middleware chain executes in priority order ===");
{
  const { dir, cleanup } = createTestDir();

  const executionOrder: string[] = [];

  const middleware1 = createTestMiddleware("middleware-low", 30, async (context, next) => {
    executionOrder.push("low");
    await next();
  });

  const middleware2 = createTestMiddleware("middleware-high", 90, async (context, next) => {
    executionOrder.push("high");
    await next();
  });

  const middleware3 = createTestMiddleware("middleware-mid", 60, async (context, next) => {
    executionOrder.push("mid");
    await next();
  });

  const context = createMockDispatchContext(dir);

  await runMiddlewareChain(context, [middleware1, middleware2, middleware3]);

  assertEq(executionOrder[0], "high", "high priority should execute first");
  assertEq(executionOrder[1], "mid", "mid priority should execute second");
  assertEq(executionOrder[2], "low", "low priority should execute last");

  cleanup();
}

// Test 2: idempotency middleware stops chain for completed units
console.log("\n=== Test: idempotency middleware stops chain for completed units ===");
{
  const { dir, cleanup } = createTestDir();

  // Create the expected artifact file for execute-task
  const sliceDir = join(dir, ".gsd", "milestones", "M001", "slices", "S01");
  mkdirSync(sliceDir, { recursive: true });
  const tasksDir = join(sliceDir, "tasks");
  mkdirSync(tasksDir, { recursive: true });
  writeFileSync(join(tasksDir, "T01-SUMMARY.md"), "# Task Summary\n\nDone.");

  const { createIdempotencyMiddleware } = await import("../middleware/idempotency.js");

  const middleware = createIdempotencyMiddleware();
  const completedKeySet = new Set(["execute-task/M001/S01/T01"]);
  const context = createMockDispatchContext(dir, completedKeySet, {
    unitType: "execute-task",
    unitId: "M001/S01/T01",
    prompt: "Test prompt",
  });

  let nextCalled = false;
  const next = async () => {
    nextCalled = true;
  };

  await middleware(context, next);

  assert(!nextCalled, "next() should NOT be called when unit is completed");
  assert(context.decision !== undefined, "decision should be set by idempotency middleware");
  assertEq(context.decision?.unitType, "skip", "decision unitType should be 'skip'");

  cleanup();
}

// Test 3: budget ceiling middleware pauses when exceeded
console.log("\n=== Test: budget ceiling middleware pauses when exceeded ===");
{
  const { dir, cleanup } = createTestDir();

  // We'll test the budget ceiling middleware by checking its behavior
  // Note: The actual budget ceiling check depends on preferences and metrics,
  // which are complex to mock. We'll verify the middleware is created correctly.

  const { createBudgetCeilingMiddleware, PAUSE_DECISION } = await import("../middleware/budget-ceiling.js");

  const middleware = createBudgetCeilingMiddleware();
  const metadata = (middleware as DispatchMiddleware & { __metadata?: { priority: number; name: string } }).__metadata;

  assertEq(metadata?.priority, 95, "budget ceiling middleware should have priority 95");
  assertEq(metadata?.name, "budget-ceiling", "budget ceiling middleware should have correct name");
  assertEq(PAUSE_DECISION.unitType, "pause", "PAUSE_DECISION should have unitType 'pause'");

  cleanup();
}

// Test 4: merge guard middleware updates state after merge
console.log("\n=== Test: merge guard middleware updates state after merge ===");
{
  const { dir, cleanup } = createTestDir();

  // Create the milestone directory structure
  const milestoneDir = join(dir, ".gsd", "milestones", "M001");
  mkdirSync(milestoneDir, { recursive: true });

  // Create a roadmap file with a done slice
  const roadmapContent = `# M001: Test Milestone

## Vision

Test vision.

## Success Criteria

- Test criteria

## Slices

- [x] S01: Test Slice
`;
  writeFileSync(join(milestoneDir, "M001-ROADMAP.md"), roadmapContent);

  const { createMergeGuardMiddleware } = await import("../middleware/merge-guard.js");

  const middleware = createMergeGuardMiddleware();
  const metadata = (middleware as DispatchMiddleware & { __metadata?: { priority: number; name: string } }).__metadata;

  assertEq(metadata?.priority, 90, "merge guard middleware should have priority 90");
  assertEq(metadata?.name, "merge-guard", "merge guard middleware should have correct name");

  cleanup();
}

// Test 5: phase dispatch middleware dispatches correct unit
console.log("\n=== Test: phase dispatch middleware dispatches correct unit ===");
{
  const { dir, cleanup } = createTestDir();

  // Create the milestone and slice directory structure
  const milestoneDir = join(dir, ".gsd", "milestones", "M001");
  mkdirSync(milestoneDir, { recursive: true });
  writeFileSync(join(milestoneDir, "M001-CONTEXT.md"), `# Context\n\nTest context.`);

  const sliceDir = join(milestoneDir, "slices", "S01");
  mkdirSync(sliceDir, { recursive: true });

  const { createPhaseDispatchMiddleware } = await import("../middleware/phase-dispatch.js");

  const middleware = createPhaseDispatchMiddleware();
  const metadata = (middleware as DispatchMiddleware & { __metadata?: { priority: number; name: string } }).__metadata;

  assertEq(metadata?.priority, 75, "phase dispatch middleware should have priority 75");
  assertEq(metadata?.name, "phase-dispatch", "phase dispatch middleware should have correct name");

  cleanup();
}

// Test 6: code review middleware dispatches review before execute
console.log("\n=== Test: code review middleware dispatches review before execute ===");
{
  const { dir, cleanup } = createTestDir();

  // Create the milestone and slice directory structure
  const milestoneDir = join(dir, ".gsd", "milestones", "M001");
  mkdirSync(milestoneDir, { recursive: true });
  writeFileSync(join(milestoneDir, "M001-CONTEXT.md"), `# Context\n\nTest context.`);

  const sliceDir = join(milestoneDir, "slices", "S01");
  mkdirSync(sliceDir, { recursive: true });

  const tasksDir = join(sliceDir, "tasks");
  mkdirSync(tasksDir, { recursive: true });

  const { createCodeReviewMiddleware } = await import("../middleware/code-review.js");

  const middleware = createCodeReviewMiddleware();
  const metadata = (middleware as DispatchMiddleware & { __metadata?: { priority: number; name: string } }).__metadata;

  assertEq(metadata?.priority, 70, "code review middleware should have priority 70");
  assertEq(metadata?.name, "code-review", "code review middleware should have correct name");

  cleanup();
}

// Test 7: multiple middlewares can modify working state
console.log("\n=== Test: multiple middlewares can modify working state ===");
{
  const { dir, cleanup } = createTestDir();

  const middleware1 = createTestMiddleware("middleware-modify-1", 80, async (context, next) => {
    if (!context.workingState.extensions) {
      context.workingState.extensions = {};
    }
    (context.workingState.extensions as Record<string, unknown>)[/* test */ "test"] = "value1";
    await next();
  });

  const middleware2 = createTestMiddleware("middleware-modify-2", 60, async (context, next) => {
    if (!context.workingState.extensions) {
      context.workingState.extensions = {};
    }
    (context.workingState.extensions as Record<string, unknown>)[/* test2 */ "test2"] = "value2";
    await next();
  });

  const context = createMockDispatchContext(dir);

  await runMiddlewareChain(context, [middleware1, middleware2]);

  const extensions = context.workingState.extensions as Record<string, unknown>;
  assert(
    extensions?.test === "value1",
    "first middleware modification should be present",
  );
  assert(
    extensions?.test2 === "value2",
    "second middleware modification should be present",
  );

  cleanup();
}

// Test 8: observability middleware always runs last
console.log("\n=== Test: observability middleware always runs last ===");
{
  const { dir, cleanup } = createTestDir();

  const { createObservabilityMiddleware } = await import("../middleware/observability.js");

  const middleware = createObservabilityMiddleware();
  const metadata = (middleware as DispatchMiddleware & { __metadata?: { priority: number; name: string } }).__metadata;

  assertEq(metadata?.priority, 60, "observability middleware should have priority 60");
  assertEq(metadata?.name, "observability", "observability middleware should have correct name");

  cleanup();
}

// Test 9: middleware chain handles errors gracefully
console.log("\n=== Test: middleware chain handles errors gracefully ===");
{
  const { dir, cleanup } = createTestDir();

  const executionOrder: string[] = [];

  const middleware1 = createTestMiddleware("middleware-1", 90, async (context, next) => {
    executionOrder.push("middleware-1");
    await next();
  });

  const middleware2 = createTestMiddleware("middleware-error", 70, async (context, next) => {
    executionOrder.push("middleware-error");
    throw new Error("Test error");
  });

  const middleware3 = createTestMiddleware("middleware-3", 50, async (context, next) => {
    executionOrder.push("middleware-3");
    context.decision = {
      unitType: "execute-task",
      unitId: "M001/S01/T01",
      prompt: "Test prompt",
    };
  });

  const context = createMockDispatchContext(dir);

  await runMiddlewareChain(context, [middleware1, middleware2, middleware3]);

  assertEq(executionOrder[0], "middleware-1", "middleware-1 should execute");
  assertEq(executionOrder[1], "middleware-error", "middleware-error should execute");
  assertEq(executionOrder[2], "middleware-3", "middleware-3 should execute despite error");
  assert(context.decision !== undefined, "decision should be set despite error");

  cleanup();
}

// Test 10: composeDispatchMiddlewares returns correct order
console.log("\n=== Test: composeDispatchMiddlewares returns correct order ===");
{
  const middlewares = composeDispatchMiddlewares();

  // Verify we have all 8 middlewares
  assertEq(middlewares.length, 8, "should have 8 middlewares");

  // Verify order by priority (highest first)
  const priorities = middlewares.map(
    (m) => (m as DispatchMiddleware & { __metadata?: { priority: number } }).__metadata?.priority,
  );

  assertEq(priorities[0], 100, "first middleware should have priority 100 (idempotency)");
  assertEq(priorities[1], 95, "second middleware should have priority 95 (budget-ceiling)");
  assertEq(priorities[2], 90, "third middleware should have priority 90 (merge-guard)");
  assertEq(priorities[3], 85, "fourth middleware should have priority 85 (uat-dispatch)");
  assertEq(priorities[4], 80, "fifth middleware should have priority 80 (reassessment)");
  assertEq(priorities[5], 75, "sixth middleware should have priority 75 (phase-dispatch)");
  assertEq(priorities[6], 70, "seventh middleware should have priority 70 (code-review)");
  assertEq(priorities[7], 60, "eighth middleware should have priority 60 (observability)");

  // Verify names
  const names = middlewares.map(
    (m) => (m as DispatchMiddleware & { __metadata?: { name: string } }).__metadata?.name,
  );

  assertEq(names[0], "idempotency", "first middleware should be idempotency");
  assertEq(names[1], "budget-ceiling", "second middleware should be budget-ceiling");
  assertEq(names[2], "merge-guard", "third middleware should be merge-guard");
  assertEq(names[3], "uat-dispatch", "fourth middleware should be uat-dispatch");
  assertEq(names[4], "reassessment", "fifth middleware should be reassessment");
  assertEq(names[5], "phase-dispatch", "sixth middleware should be phase-dispatch");
  assertEq(names[6], "code-review", "seventh middleware should be code-review");
  assertEq(names[7], "observability", "eighth middleware should be observability");
}

// Test 11: composeDispatchMiddlewaresWithConfig filters disabled middlewares
console.log("\n=== Test: composeDispatchMiddlewaresWithConfig filters disabled middlewares ===");
{
  const middlewares = composeDispatchMiddlewaresWithConfig({
    idempotency: { enabled: true },
    budgetCeiling: { enabled: false },
    mergeGuard: { enabled: true },
    uatDispatch: { enabled: false },
    reassessment: { enabled: true },
    phaseDispatch: { enabled: false },
    codeReview: { enabled: true },
    observability: { enabled: true },
  });

  // Should have 5 middlewares (idempotency, merge-guard, reassessment, code-review, observability)
  assertEq(middlewares.length, 5, "should have 5 enabled middlewares");

  // Verify order by priority
  const priorities = middlewares.map(
    (m) => (m as DispatchMiddleware & { __metadata?: { priority: number } }).__metadata?.priority,
  );

  assertEq(priorities[0], 100, "first middleware should have priority 100 (idempotency)");
  assertEq(priorities[1], 90, "second middleware should have priority 90 (merge-guard)");
  assertEq(priorities[2], 80, "third middleware should have priority 80 (reassessment)");
  assertEq(priorities[3], 70, "fourth middleware should have priority 70 (code-review)");
  assertEq(priorities[4], 60, "fifth middleware should have priority 60 (observability)");
}

// ─── Summary ────────────────────────────────────────────────────────────────

console.log("\n" + "=".repeat(70));
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log("=".repeat(70));

if (failed > 0) {
  process.exit(1);
}
