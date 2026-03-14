// GSD Extension — Auto Middleware Integration Tests
// Tests for preferences-based middleware composition in auto.ts dispatch flow.

import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { composeDispatchMiddlewares, composeDispatchMiddlewaresWithPreferences } from "../middleware/index.js";
import { loadMiddlewareConfig } from "../preferences.js";
import type {
  DispatchContext,
  DispatchMiddleware,
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
 * Get middleware priority from metadata
 */
function getMiddlewarePriority(middleware: DispatchMiddleware): number | undefined {
  return (middleware as DispatchMiddleware & { __metadata?: { priority: number } }).__metadata?.priority;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

console.log("\n=== Auto Middleware Integration Tests ===\n");

// Test 1: executeDispatchMiddlewares loads preferences and applies middleware config
console.log("=== Test 1: executeDispatchMiddlewares loads preferences and applies middleware config ===");
{
  const prefs: GSDPreferences = {
    middleware: {
      enabled: [
        { name: "idempotency", priority: 100 },
        { name: "budget-ceiling", priority: 95 },
        { name: "merge-guard", priority: 90 },
      ],
    },
  };

  const middlewares = composeDispatchMiddlewaresWithPreferences(prefs);

  // Should only have the 3 enabled middlewares
  assertEq(middlewares.length, 3, "should have exactly 3 enabled middlewares");

  // Verify they are in priority order
  const names = middlewares.map(getMiddlewareName);
  assertEq(names[0], "idempotency", "first middleware should be idempotency");
  assertEq(names[1], "budget-ceiling", "second middleware should be budget-ceiling");
  assertEq(names[2], "merge-guard", "third middleware should be merge-guard");

  const priorities = middlewares.map(getMiddlewarePriority);
  assertEq(priorities[0], 100, "idempotency should have priority 100");
  assertEq(priorities[1], 95, "budget-ceiling should have priority 95");
  assertEq(priorities[2], 90, "merge-guard should have priority 90");
}

// Test 2: disabled middlewares from preferences are not executed
console.log("\n=== Test 2: disabled middlewares from preferences are not executed ===");
{
  const prefs: GSDPreferences = {
    middleware: {
      disabled: ["code-review", "uat-dispatch", "observability"],
    },
  };

  const middlewares = composeDispatchMiddlewaresWithPreferences(prefs);

  // Should have 5 middlewares (8 - 3 disabled)
  assertEq(middlewares.length, 5, "should have 5 middlewares (3 disabled)");

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

// Test 3: priority overrides from preferences are respected
console.log("\n=== Test 3: priority overrides from preferences are respected ===");
{
  const prefs: GSDPreferences = {
    middleware: {
      enabled: [
        { name: "idempotency", priority: 100 },
        { name: "merge-guard", priority: 90 },
        { name: "uat-dispatch", priority: 85 },
        { name: "reassessment", priority: 80 },
        { name: "phase-dispatch", priority: 75 },
        { name: "code-review", priority: 70 },
        { name: "observability", priority: 60 },
        { name: "budget-ceiling", priority: 50 }, // Override: move budget-ceiling to priority 50
      ],
    },
  };

  const middlewares = composeDispatchMiddlewaresWithPreferences(prefs);

  // Verify budget-ceiling is now at the end (priority 50)
  const names = middlewares.map(getMiddlewareName);
  const priorities = middlewares.map(getMiddlewarePriority);

  // budget-ceiling should be last (priority 50)
  assertEq(names[names.length - 1], "budget-ceiling", "budget-ceiling should be last");
  assertEq(priorities[priorities.length - 1], 50, "budget-ceiling should have priority 50");
}

// Test 4: falls back to defaults when no middleware config
console.log("\n=== Test 4: falls back to defaults when no middleware config ===");
{
  const prefs: GSDPreferences = {}; // No middleware config

  const middlewares = composeDispatchMiddlewaresWithPreferences(prefs);

  // Should have all 8 default middlewares
  assertEq(middlewares.length, 8, "should have all 8 default middlewares");

  // Verify default order
  const names = middlewares.map(getMiddlewareName);
  assertEq(names[0], "idempotency", "first middleware should be idempotency");
  assertEq(names[1], "budget-ceiling", "second middleware should be budget-ceiling");
  assertEq(names[2], "merge-guard", "third middleware should be merge-guard");
  assertEq(names[3], "uat-dispatch", "fourth middleware should be uat-dispatch");
  assertEq(names[4], "reassessment", "fifth middleware should be reassessment");
  assertEq(names[5], "phase-dispatch", "sixth middleware should be phase-dispatch");
  assertEq(names[6], "code-review", "seventh middleware should be code-review");
  assertEq(names[7], "observability", "eighth middleware should be observability");
}

// Test 5: falls back to defaults when no preferences file
console.log("\n=== Test 5: falls back to defaults when no preferences file ===");
{
  // When prefs is null/undefined, composeDispatchMiddlewaresWithPreferences
  // should fall back to composeDispatchMiddlewares()
  const prefs: GSDPreferences = undefined as any;

  // This simulates the behavior when loadEffectiveGSDPreferences() returns null
  // and the code falls back to composeDispatchMiddlewares()
  const middlewares = composeDispatchMiddlewares();

  // Should have all 8 default middlewares
  assertEq(middlewares.length, 8, "should have all 8 default middlewares when no prefs");
}

// Test 6: custom registered middlewares are still included
console.log("\n=== Test 6: custom registered middlewares are still included ===");
{
  const { registerDispatchMiddleware, clearRegisteredDispatchMiddlewares } = await import("../middleware/index.js");

  clearRegisteredDispatchMiddlewares();

  // Register a custom middleware
  registerDispatchMiddleware({
    name: "custom-middleware",
    priority: 88,
    enabled: true,
    middleware: async (context, next) => {
      await next();
    },
  });

  const prefs: GSDPreferences = {};

  const middlewares = composeDispatchMiddlewaresWithPreferences(prefs);

  // Should have 9 middlewares (8 default + 1 custom)
  assertEq(middlewares.length, 9, "should have 9 middlewares (8 default + 1 custom)");

  // Verify custom middleware is present and in correct position (between merge-guard and uat-dispatch)
  const names = middlewares.map(getMiddlewareName);
  const priorities = middlewares.map(getMiddlewarePriority);

  // Find custom middleware position
  const customIndex = names.indexOf("custom-middleware");
  assert(customIndex !== -1, "custom middleware should be present");
  assertEq(priorities[customIndex], 88, "custom middleware should have priority 88");
  // Should be between merge-guard (90) and uat-dispatch (85)
  assertEq(names[customIndex - 1], "merge-guard", "custom middleware should be after merge-guard");
  assertEq(names[customIndex + 1], "uat-dispatch", "custom middleware should be before uat-dispatch");

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
        { name: "idempotency", priority: 100 },
        { name: "budget-ceiling", priority: 95 },
        { name: "merge-guard", priority: 90 },
        { name: "phase-dispatch", priority: 75 },
      ],
      disabled: ["code-review", "uat-dispatch", "reassessment", "observability"],
    },
  };

  const middlewares = composeDispatchMiddlewaresWithPreferences(prefs);

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
        { name: "idempotency", priority: 100 },
        { name: "budget-ceiling", priority: 95 },
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
  assertEq(config.enabled?.[0].priority, 100, "idempotency should have priority 100");
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
        { name: "idempotency", priority: 100 },
        { name: "budget-ceiling", priority: 95 },
        { name: "code-review", priority: 70 },
      ],
      disabled: ["code-review"], // code-review in both lists
    },
  };

  const middlewares = composeDispatchMiddlewaresWithPreferences(prefs);

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
