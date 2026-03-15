// GSD Extension — Auto Middleware Integration Tests
// Tests for preferences-based middleware composition in auto.ts dispatch flow.

import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { composeDispatchMiddlewares } from "../middleware/index.js";
import { loadMiddlewareConfig } from "../preferences.js";
import type {
  DispatchContext,
  DispatchMiddleware,
  PipelineStage,
} from "../middleware/types.js";
import type { GSDState } from "../types.js";
import type { GSDPreferences } from "../preferences.js";

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

function assertNotNull<T>(actual: T, message: string): void {
  if (actual !== null) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${message} — expected not null, got null`);
  }
}

function assertArrayContains<T>(array: T[], item: T, message: string): void {
  if (array.some(i => JSON.stringify(i) === JSON.stringify(item))) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${message} — expected array to contain ${JSON.stringify(item)}`);
  }
}

function assertArrayNotContains<T>(array: T[], item: T, message: string): void {
  if (!array.some(i => JSON.stringify(i) === JSON.stringify(item))) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${message} — expected array NOT to contain ${JSON.stringify(item)}`);
  }
}

// Create a temporary test directory
function createTestDir(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "gsd-auto-middleware-test-"));
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
    hasUI: true,
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
 * Get middleware name from metadata
 */
function getMiddlewareName(middleware: DispatchMiddleware): string | undefined {
  return (middleware as DispatchMiddleware & { __metadata?: { name: string } }).__metadata?.name;
}

/**
 * Get middleware stage from metadata
 */
function getMiddlewareStage(middleware: DispatchMiddleware): PipelineStage | undefined {
  return (middleware as DispatchMiddleware & { __metadata?: { stage: PipelineStage } }).__metadata?.stage;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

console.log("\n=== Auto Middleware Integration Tests ===\n");

// Test 1: executeDispatchMiddlewares loads preferences and applies middleware config
console.log("=== Test 1: executeDispatchMiddlewares loads preferences and applies middleware config ===");
{
  const prefs: GSDPreferences = {
    middleware: {
      enabled: [
        { name: "idempotency", stage: "pre-validation" as PipelineStage },
        { name: "budget-ceiling", stage: "pre-dispatch" as PipelineStage },
        { name: "merge-guard", stage: "pre-dispatch" as PipelineStage },
      ],
    },
  };

  const middlewares = composeDispatchMiddlewares(prefs);

  // Should only have the 3 enabled middlewares
  assertEq(middlewares.length, 3, "should have exactly 3 enabled middlewares");

  // Verify they are in stage order
  const names = middlewares.map(getMiddlewareName);
  assertEq(names[0], "idempotency", "first middleware should be idempotency");
  assertEq(names[1], "budget-ceiling", "second middleware should be budget-ceiling");
  assertEq(names[2], "merge-guard", "third middleware should be merge-guard");

  const stages = middlewares.map(getMiddlewareStage);
  assertEq(stages[0], "pre-validation", "idempotency should have stage pre-validation");
  assertEq(stages[1], "pre-dispatch", "budget-ceiling should have stage pre-dispatch");
  assertEq(stages[2], "pre-dispatch", "merge-guard should have stage pre-dispatch");
}

// Test 2: disabled middlewares from preferences are not executed
console.log("\n=== Test 2: disabled middlewares from preferences are not executed ===");
{
  const prefs: GSDPreferences = {
    middleware: {
      disabled: ["code-review", "uat-dispatch", "observability"],
    },
  };

  const middlewares = composeDispatchMiddlewares(prefs);

  // Should have 8 middlewares (11 - 3 disabled)
  assertEq(middlewares.length, 8, "should have 8 middlewares (3 disabled)");

  // Verify disabled middlewares are not present
  const names = middlewares.map(getMiddlewareName);
  assertArrayNotContains(names, "code-review", "code-review should not be present");
  assertArrayNotContains(names, "uat-dispatch", "uat-dispatch should not be present");
  assertArrayNotContains(names, "observability", "observability should not be present");

  // Verify remaining middlewares are present
  assertArrayContains(names, "idempotency", "idempotency should be present");
  assertArrayContains(names, "budget-ceiling", "budget-ceiling should be present");
  assertArrayContains(names, "merge-guard", "merge-guard should be present");
  assertArrayContains(names, "reassessment", "reassessment should be present");
  assertArrayContains(names, "phase-dispatch", "phase-dispatch should be present");
}

// Test 3: enabled list from preferences is respected
console.log("\n=== Test 3: enabled list from preferences is respected ===");
{
  const prefs: GSDPreferences = {
    middleware: {
      enabled: [
        { name: "idempotency" },
        { name: "merge-guard" },
        { name: "uat-dispatch" },
        { name: "reassessment" },
        { name: "phase-dispatch" },
        { name: "code-review" },
        { name: "observability" },
        { name: "budget-ceiling" },
      ],
    },
  };

  const middlewares = composeDispatchMiddlewares(prefs);

  // Verify all enabled middlewares are present with their default stages
  const names = middlewares.map(getMiddlewareName);
  const stages = middlewares.map(getMiddlewareStage);

  assertArrayContains(names, "idempotency", "idempotency should be present");
  assertArrayContains(names, "budget-ceiling", "budget-ceiling should be present");
  assertArrayContains(names, "observability", "observability should be present");

  // Verify default stages are used
  const idempotencyIndex = names.indexOf("idempotency");
  assertEq(stages[idempotencyIndex], "pre-validation", "idempotency should have default stage pre-validation");

  const budgetCeilingIndex = names.indexOf("budget-ceiling");
  assertEq(stages[budgetCeilingIndex], "pre-dispatch", "budget-ceiling should have default stage pre-dispatch");

  const observabilityIndex = names.indexOf("observability");
  assertEq(stages[observabilityIndex], "post-dispatch", "observability should have default stage post-dispatch");
}

// Test 4: falls back to defaults when no middleware config
console.log("\n=== Test 4: falls back to defaults when no middleware config ===");
{
  const prefs: GSDPreferences = {}; // No middleware config

  const middlewares = composeDispatchMiddlewares(prefs);

  // Should have all 11 default middlewares
  assertEq(middlewares.length, 11, "should have all 11 default middlewares");

  // Verify default order
  const names = middlewares.map(getMiddlewareName);
  assertEq(names[0], "idempotency", "first middleware should be idempotency");
  assertEq(names[1], "validation", "second middleware should be validation");
  assertEq(names[2], "budget-ceiling", "third middleware should be budget-ceiling");
  assertEq(names[3], "merge-guard", "fourth middleware should be merge-guard");
  assertEq(names[4], "uat-dispatch", "fifth middleware should be uat-dispatch");
  assertEq(names[5], "reassessment", "sixth middleware should be reassessment");
  assertEq(names[6], "phase-dispatch", "seventh middleware should be phase-dispatch");
  assertEq(names[7], "code-review", "eighth middleware should be code-review");
  assertEq(names[8], "metrics", "ninth middleware should be metrics");
  assertEq(names[9], "observability", "tenth middleware should be observability");
  assertEq(names[10], "notifications", "eleventh middleware should be notifications");
}

// Test 5: falls back to defaults when no preferences file
console.log("\n=== Test 5: falls back to defaults when no preferences file ===");
{
  // When prefs is null/undefined, composeDispatchMiddlewares
  // should fall back to composeDispatchMiddlewares()
  const prefs: GSDPreferences = undefined as any;

  // This simulates the behavior when loadEffectiveGSDPreferences() returns null
  // and the code falls back to composeDispatchMiddlewares()
  const middlewares = composeDispatchMiddlewares();

  // Should have all 11 default middlewares
  assertEq(middlewares.length, 11, "should have all 11 default middlewares when no prefs");
}

// Test 6: custom registered middlewares are still included
console.log("\n=== Test 6: custom registered middlewares are still included ===");
{
  const { registerDispatchMiddleware, clearRegisteredDispatchMiddlewares } = await import("../middleware/index.js");

  clearRegisteredDispatchMiddlewares();

  // Register a custom middleware
  registerDispatchMiddleware({
    name: "custom-middleware",
    stage: "dispatch",
    enabled: true,
    middleware: async (context, next) => {
      await next();
    },
  });

  const prefs: GSDPreferences = {};

  const middlewares = composeDispatchMiddlewares(prefs);

  // Should have 12 middlewares (11 default + 1 custom)
  assertEq(middlewares.length, 12, "should have 12 middlewares (11 default + 1 custom)");

  // Verify custom middleware is present and in correct position (in dispatch stage)
  const names = middlewares.map(getMiddlewareName);
  const stages = middlewares.map(getMiddlewareStage);

  // Find custom middleware position
  const customIndex = names.indexOf("custom-middleware");
  assert(customIndex !== -1, "custom middleware should be present");
  assertEq(stages[customIndex], "dispatch", "custom middleware should have stage dispatch");

  // Cleanup
  clearRegisteredDispatchMiddlewares();
}

// Test 7: integration works end-to-end with real dispatch flow
console.log("\n=== Test 7: integration works end-to-end with real dispatch flow ===");
{
  const { dir, cleanup } = createTestDir();

  // Initialize git repo to avoid git errors in middlewares
  try {
    const { execSync } = await import("node:child_process");
    execSync("git init -b main", { cwd: dir, stdio: "pipe" });
  } catch {
    // Ignore if git init fails
  }

  const prefs: GSDPreferences = {
    middleware: {
      enabled: [
        { name: "idempotency", stage: "pre-validation" as PipelineStage },
        { name: "budget-ceiling", stage: "pre-dispatch" as PipelineStage },
        { name: "merge-guard", stage: "pre-dispatch" as PipelineStage },
        { name: "phase-dispatch", stage: "dispatch" as PipelineStage },
      ],
      disabled: ["code-review", "uat-dispatch", "reassessment", "observability"],
    },
  };

  const middlewares = composeDispatchMiddlewares(prefs);

  // Should have exactly 4 middlewares
  assertEq(middlewares.length, 4, "should have exactly 4 middlewares");

  // Create mock context
  const context = createMockDispatchContext(dir);

  // Execute middleware chain
  let executionOrder: string[] = [];
  let index = 0;

  // Execute chain with original middlewares, tracking execution
  async function next(): Promise<void> {
    if (context.decision) return;
    const middleware = middlewares[index++];
    if (!middleware) return;
    const name = getMiddlewareName(middleware) || "unknown";
    executionOrder.push(name);
    await middleware(context, next);
  }

  await next();

  // Verify execution order
  assertEq(executionOrder[0], "idempotency", "idempotency should execute first");
  assertEq(executionOrder[1], "budget-ceiling", "budget-ceiling should execute second");
  assertEq(executionOrder[2], "merge-guard", "merge-guard should execute third");
  assertEq(executionOrder[3], "phase-dispatch", "phase-dispatch should execute last");

  // Note: The actual middlewares may or may not set a decision depending on state
  // The important thing is that the chain executes in the correct order
  assert(executionOrder.length === 4, "all 4 middlewares should have executed");

  cleanup();
}

// Test 8: loadMiddlewareConfig correctly extracts middleware preferences
console.log("\n=== Test 8: loadMiddlewareConfig correctly extracts middleware preferences ===");
{
  const prefs: GSDPreferences = {
    middleware: {
      enabled: [
        { name: "idempotency", stage: "pre-validation" as PipelineStage },
        { name: "budget-ceiling", stage: "pre-dispatch" as PipelineStage },
      ],
      disabled: ["code-review"],
    },
  };

  const config = loadMiddlewareConfig(prefs);

  assertNotUndefined(config.enabled, "enabled should be defined");
  assertNotUndefined(config.disabled, "disabled should be defined");

  assertEq(config.enabled?.length, 2, "should have 2 enabled middlewares");
  assertEq(config.disabled?.length, 1, "should have 1 disabled middleware");

  assertEq(config.enabled?.[0].name, "idempotency", "first enabled should be idempotency");
  assertEq(config.enabled?.[0].stage, "pre-validation" as PipelineStage, "idempotency should have stage pre-validation");
  assertEq(config.disabled?.[0], "code-review", "disabled should contain code-review");
}

// Test 9: loadMiddlewareConfig returns empty config when no middleware preferences
console.log("\n=== Test 9: loadMiddlewareConfig returns empty config when no middleware preferences ===");
{
  const prefs: GSDPreferences = {};

  const config = loadMiddlewareConfig(prefs);

  assert(config.enabled === undefined || config.enabled?.length === 0, "enabled should be undefined or empty");
  assert(config.disabled === undefined || config.disabled?.length === 0, "disabled should be undefined or empty");
}

// Test 10: combined enabled and disabled lists work correctly
console.log("\n=== Test 10: combined enabled and disabled lists work correctly ===");
{
  const prefs: GSDPreferences = {
    middleware: {
      enabled: [
        { name: "idempotency", stage: "pre-validation" as PipelineStage },
        { name: "budget-ceiling", stage: "pre-dispatch" as PipelineStage },
        { name: "code-review", stage: "dispatch" as PipelineStage },
      ],
      disabled: ["code-review"], // code-review in both lists
    },
  };

  const middlewares = composeDispatchMiddlewares(prefs);

  // Disabled should take precedence - code-review should not be present
  const names = middlewares.map(getMiddlewareName);
  assertArrayNotContains(names, "code-review", "code-review should not be present (disabled takes precedence)");
  assertArrayContains(names, "idempotency", "idempotency should be present");
  assertArrayContains(names, "budget-ceiling", "budget-ceiling should be present");
}

// ─── Summary ────────────────────────────────────────────────────────────────

console.log("\n" + "=".repeat(70));
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log("=".repeat(70));

if (failed > 0) {
  process.exit(1);
}
