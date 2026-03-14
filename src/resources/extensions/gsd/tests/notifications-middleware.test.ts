// GSD Extension — Notifications Middleware Tests
// Tests for the notifications middleware that sends notifications at key dispatch lifecycle points.

import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { createNotificationsMiddleware } from "../middleware/notifications.js";
import type {
  DispatchContext,
  DispatchMiddleware,
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

function assertUndefined<T>(actual: T, message: string): void {
  if (actual === undefined) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${message} — expected undefined, got ${JSON.stringify(actual)}`);
  }
}

// Create a temporary test directory
function createTestDir(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "gsd-notifications-middleware-test-"));
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
 * Creates a mock ExtensionContext
 */
function createMockExtensionContext(): any {
  return {
    ui: {
      notify: () => {},
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
 * Creates a mock GSDState
 */
function createMockGSDState(): GSDState {
  return {
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
    workingState: { ...gsdState, extensions: { ...gsdState.extensions } },
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

// ─── Tests ──────────────────────────────────────────────────────────────────

console.log("\n=== Notifications Middleware Tests ===\n");

// Test 1: notifications middleware calls onDispatchStart
console.log("=== Test 1: notifications middleware calls onDispatchStart ===");
{
  const { dir, cleanup } = createTestDir();

  let onDispatchStartCalled = false;
  const middleware = createNotificationsMiddleware({
    onDispatchStart: (ctx) => {
      onDispatchStartCalled = true;
    },
  });
  const context = createMockDispatchContext(dir);

  await middleware(context, async () => {
    // Empty next
  });

  assert(onDispatchStartCalled, "onDispatchStart callback should be called");

  cleanup();
}

// Test 2: notifications middleware calls onDispatchComplete
console.log("\n=== Test 2: notifications middleware calls onDispatchComplete ===");
{
  const { dir, cleanup } = createTestDir();

  let onDispatchCompleteCalled = false;
  const middleware = createNotificationsMiddleware({
    onDispatchComplete: (ctx) => {
      onDispatchCompleteCalled = true;
    },
  });
  const context = createMockDispatchContext(dir);

  await middleware(context, async () => {
    // Empty next
  });

  assert(onDispatchCompleteCalled, "onDispatchComplete callback should be called");

  cleanup();
}

// Test 3: notifications middleware calls onDispatchError on failure
console.log("\n=== Test 3: notifications middleware calls onDispatchError on failure ===");
{
  const { dir, cleanup } = createTestDir();

  let onDispatchErrorCalled = false;
  let errorReceived: Error | undefined;
  const middleware = createNotificationsMiddleware({
    onDispatchError: (ctx, error) => {
      onDispatchErrorCalled = true;
      errorReceived = error;
    },
  });
  const context = createMockDispatchContext(dir);

  let errorCaught = false;
  try {
    await middleware(context, async () => {
      throw new Error("Test error");
    });
  } catch {
    errorCaught = true;
  }

  assert(onDispatchErrorCalled, "onDispatchError callback should be called on error");
  assert(errorCaught, "error should propagate from next()");
  assert(errorReceived !== undefined, "error should be passed to callback");
  assertEq(errorReceived?.message, "Test error", "error message should match");

  cleanup();
}

// Test 4: notifications middleware errors don't break chain
console.log("\n=== Test 4: notifications middleware errors don't break chain ===");
{
  const { dir, cleanup } = createTestDir();

  let nextCalled = false;
  let onDispatchCompleteCalled = false;
  const middleware = createNotificationsMiddleware({
    onDispatchStart: () => {
      throw new Error("Callback error");
    },
    onDispatchComplete: (ctx) => {
      onDispatchCompleteCalled = true;
    },
  });
  const context = createMockDispatchContext(dir);

  await middleware(context, async () => {
    nextCalled = true;
  });

  assert(nextCalled, "next() should still be called despite callback error");
  assert(onDispatchCompleteCalled, "onDispatchComplete should still be called");

  cleanup();
}

// Test 5: notifications middleware passes correct context to callbacks
console.log("\n=== Test 5: notifications middleware passes correct context to callbacks ===");
{
  const { dir, cleanup } = createTestDir();

  let receivedContext: DispatchContext | undefined;
  let receivedError: Error | undefined;
  const middleware = createNotificationsMiddleware({
    onDispatchStart: (ctx) => {
      receivedContext = ctx;
    },
    onDispatchError: (ctx, error) => {
      receivedContext = ctx;
      receivedError = error;
    },
  });
  const context = createMockDispatchContext(dir, new Set(), {
    unitType: "execute-task",
    unitId: "M001/S01/T01",
    prompt: "Test prompt",
  });

  let errorCaught = false;
  try {
    await middleware(context, async () => {
      throw new Error("Test error");
    });
  } catch {
    errorCaught = true;
  }

  assert(receivedContext !== undefined, "context should be passed to callback");
  assertEq(receivedContext?.basePath, dir, "context basePath should match");
  assert(receivedError !== undefined, "error should be passed to onDispatchError");
  assertEq(receivedError?.message, "Test error", "error message should match");

  cleanup();
}

// Test 6: notifications middleware uses priority 55
console.log("\n=== Test 6: notifications middleware uses priority 55 ===");
{
  const middleware = createNotificationsMiddleware();
  const metadata = (middleware as DispatchMiddleware & { __metadata?: { priority: number; name: string } }).__metadata;

  assertEq(metadata?.priority, 55, "notifications middleware should have priority 55");
  assertEq(metadata?.name, "notifications", "notifications middleware should have name 'notifications'");
}

// Test 7: notifications middleware respects enabled/disabled config
console.log("\n=== Test 7: notifications middleware respects enabled/disabled config ===");
{
  const { dir, cleanup } = createTestDir();

  let callbackCalled = false;
  const disabledMiddleware = createNotificationsMiddleware({
    enabled: false,
    onDispatchStart: (ctx) => {
      callbackCalled = true;
    },
  });
  const context = createMockDispatchContext(dir);

  await disabledMiddleware(context, async () => {
    // This should not be called
    throw new Error("next() should not be called for disabled middleware");
  });

  assert(!callbackCalled, "callback should not be called for disabled middleware");

  // Test enabled middleware with explicit config
  callbackCalled = false;
  const enabledMiddleware = createNotificationsMiddleware({
    enabled: true,
    priority: 55,
    onDispatchStart: (ctx) => {
      callbackCalled = true;
    },
  });
  const context2 = createMockDispatchContext(dir);

  await enabledMiddleware(context2, async () => {
    // Empty next
  });

  assert(callbackCalled, "callback should be called for enabled middleware");
  const metadata = (enabledMiddleware as DispatchMiddleware & { __metadata?: { priority: number } }).__metadata;
  assertEq(metadata?.priority, 55, "enabled middleware should have priority 55");

  cleanup();
}

// Test 8: notifications middleware factory creates middleware correctly
console.log("\n=== Test 8: notifications middleware factory creates middleware correctly ===");
{
  // Test default configuration
  const defaultMiddleware = createNotificationsMiddleware();
  const defaultMetadata = (defaultMiddleware as DispatchMiddleware & { __metadata?: { priority: number; name: string } }).__metadata;

  assertEq(defaultMetadata?.priority, 55, "default middleware should have priority 55");
  assertEq(defaultMetadata?.name, "notifications", "default middleware should have name 'notifications'");

  // Test custom configuration
  const customMiddleware = createNotificationsMiddleware({
    priority: 60,
    enabled: true,
    name: "custom-notifications",
  });
  const customMetadata = (customMiddleware as DispatchMiddleware & { __metadata?: { priority: number; name: string } }).__metadata;

  assertEq(customMetadata?.priority, 60, "custom middleware should have custom priority");
  assertEq(customMetadata?.name, "custom-notifications", "custom middleware should have custom name");

  // Test that each call returns a new instance
  const middleware1 = createNotificationsMiddleware();
  const middleware2 = createNotificationsMiddleware();

  assert(middleware1 !== middleware2, "factory should return different instances");
}

// Test 9: notifications middleware handles async callbacks
console.log("\n=== Test 9: notifications middleware handles async callbacks ===");
{
  const { dir, cleanup } = createTestDir();

  let onDispatchStartCalled = false;
  let onDispatchCompleteCalled = false;
  const middleware = createNotificationsMiddleware({
    onDispatchStart: async (ctx) => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      onDispatchStartCalled = true;
    },
    onDispatchComplete: async (ctx) => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      onDispatchCompleteCalled = true;
    },
  });
  const context = createMockDispatchContext(dir);

  await middleware(context, async () => {
    // Empty next
  });

  assert(onDispatchStartCalled, "async onDispatchStart callback should complete");
  assert(onDispatchCompleteCalled, "async onDispatchComplete callback should complete");

  cleanup();
}

// Test 10: notifications middleware is no-op when no callbacks provided
console.log("\n=== Test 10: notifications middleware is no-op when no callbacks provided ===");
{
  const { dir, cleanup } = createTestDir();

  let nextCalled = false;
  const middleware = createNotificationsMiddleware();
  const context = createMockDispatchContext(dir);

  await middleware(context, async () => {
    nextCalled = true;
  });

  assert(nextCalled, "next() should be called even when no callbacks provided");

  cleanup();
}

// ─── Summary ────────────────────────────────────────────────────────────────

console.log("\n" + "=".repeat(70));
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log("=".repeat(70));

if (failed > 0) {
  process.exit(1);
}
