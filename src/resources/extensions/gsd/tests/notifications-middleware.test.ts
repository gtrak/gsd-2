// GSD Extension — Notifications Middleware Tests
// Tests for the notifications middleware that sends notifications at dispatch events.

import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { createNotificationsMiddleware } from "../middleware/notifications.js";
import type {
  DispatchContext,
  DispatchMiddleware,
  PipelineStage,
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

function assertNotCalled<T>(actual: T, message: string): void {
  if (actual === undefined || actual === null) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${message} — expected not called, but was called`);
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
 * Creates a mock ExtensionContext with notification tracking
 */
function createMockExtensionContext(): {
  ctx: any;
  notifications: Array<{ message: string; type: string }>;
} {
  const notifications: Array<{ message: string; type: string }> = [];
  const mockCtx = {
    ui: {
      notify: (message: string, type: string = "info") => {
        notifications.push({ message, type });
      },
    },
  };
  return { ctx: mockCtx, notifications };
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
  mockCtx?: any,
): DispatchContext {
  const ctx = mockCtx ?? createMockExtensionContext().ctx;
  const mockPi = createMockExtensionAPI();
  const gsdState = state ?? createMockGSDState();

  return {
    basePath,
    pi: mockPi,
    ctx,
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

// Test 1: notifications middleware sends notification on dispatch start
console.log("=== Test 1: notifications middleware sends notification on dispatch start ===");
{
  const { dir, cleanup } = createTestDir();
  const { ctx, notifications } = createMockExtensionContext();

  const middleware = createNotificationsMiddleware({ onDispatchStart: true });
  const context = createMockDispatchContext(dir, new Set(), undefined, undefined, ctx);

  context.decision = {
    unitType: "execute-task",
    unitId: "M001/S01/T01",
    prompt: "Test prompt",
  };

  await middleware(context, async () => {
    // Empty next
  });

  assert(notifications.length >= 1, "should have at least one notification");
  assert(notifications[0].message.includes("Dispatching"), "notification should include 'Dispatching'");
  assert(notifications[0].message.includes("execute-task"), "notification should include unitType");
  assert(notifications[0].message.includes("M001/S01/T01"), "notification should include unitId");

  cleanup();
}

// Test 2: notifications middleware sends notification on dispatch complete
console.log("\n=== Test 2: notifications middleware sends notification on dispatch complete ===");
{
  const { dir, cleanup } = createTestDir();
  const { ctx, notifications } = createMockExtensionContext();

  const middleware = createNotificationsMiddleware({ onDispatchComplete: true });
  const context = createMockDispatchContext(dir, new Set(), undefined, undefined, ctx);

  context.decision = {
    unitType: "complete-slice",
    unitId: "M001/S01",
    prompt: "Test prompt",
  };

  await middleware(context, async () => {
    // Empty next
  });

  assert(notifications.length >= 1, "should have at least one notification");
  assert(notifications[0].message.includes("Dispatched"), "notification should include 'Dispatched'");
  assert(notifications[0].message.includes("complete-slice"), "notification should include unitType");
  assert(notifications[0].message.includes("M001/S01"), "notification should include unitId");

  cleanup();
}

// Test 3: notifications middleware uses default messages when enabled
console.log("\n=== Test 3: notifications middleware uses default messages when enabled ===");
{
  const { dir, cleanup } = createTestDir();
  const { ctx, notifications } = createMockExtensionContext();

  const middleware = createNotificationsMiddleware({
    onDispatchStart: true,
    onDispatchComplete: true,
  });
  const context = createMockDispatchContext(dir, new Set(), undefined, undefined, ctx);

  context.decision = {
    unitType: "execute-task",
    unitId: "M001/S01/T01",
    prompt: "Test prompt",
  };

  await middleware(context, async () => {
    // Empty next
  });

  assert(notifications.length === 2, "should have 2 notifications");
  assert(notifications[0].message === "Dispatching execute-task M001/S01/T01", "first notification should use default start message");
  assert(notifications[1].message === "Dispatched execute-task M001/S01/T01", "second notification should use default complete message");

  cleanup();
}

// Test 4: notifications middleware uses custom messages when configured
console.log("\n=== Test 4: notifications middleware uses custom messages when configured ===");
{
  const { dir, cleanup } = createTestDir();
  const { ctx, notifications } = createMockExtensionContext();

  const middleware = createNotificationsMiddleware({
    onDispatchStart: "Starting {unitType} {unitId}",
    onDispatchComplete: "Finished {unitType} {unitId}",
  });
  const context = createMockDispatchContext(dir, new Set(), undefined, undefined, ctx);

  context.decision = {
    unitType: "complete-milestone",
    unitId: "M001",
    prompt: "Test prompt",
  };

  await middleware(context, async () => {
    // Empty next
  });

  assert(notifications.length === 2, "should have 2 notifications");
  assert(notifications[0].message === "Starting complete-milestone M001", "first notification should use custom start message");
  assert(notifications[1].message === "Finished complete-milestone M001", "second notification should use custom complete message");

  cleanup();
}

// Test 5: notifications middleware can be disabled
console.log("\n=== Test 5: notifications middleware can be disabled ===");
{
  const { dir, cleanup } = createTestDir();
  const { ctx, notifications } = createMockExtensionContext();

  const middleware = createNotificationsMiddleware({
    enabled: false,
    onDispatchStart: true,
    onDispatchComplete: true,
  });
  const context = createMockDispatchContext(dir, new Set(), undefined, undefined, ctx);

  context.decision = {
    unitType: "execute-task",
    unitId: "M001/S01/T01",
    prompt: "Test prompt",
  };

  await middleware(context, async () => {
    // Empty next
  });

  assert(notifications.length === 0, "should have no notifications when disabled");

  cleanup();
}

// Test 6: notifications middleware calls next()
console.log("\n=== Test 6: notifications middleware calls next() ===");
{
  const { dir, cleanup } = createTestDir();
  const { ctx, notifications } = createMockExtensionContext();

  const middleware = createNotificationsMiddleware({ onDispatchStart: true });
  const context = createMockDispatchContext(dir, new Set(), undefined, undefined, ctx);

  let nextCalled = false;
  await middleware(context, async () => {
    nextCalled = true;
  });

  assert(nextCalled, "next() should be called");
  assert(notifications.length === 1, "should have sent notification");

  cleanup();
}

// Test 7: notifications middleware handles errors gracefully
console.log("\n=== Test 7: notifications middleware handles errors gracefully ===");
{
  const { dir, cleanup } = createTestDir();
  const { ctx, notifications } = createMockExtensionContext();

  const middleware = createNotificationsMiddleware({
    onDispatchStart: true,
    onError: true,
  });
  const context = createMockDispatchContext(dir, new Set(), undefined, undefined, ctx);

  context.decision = {
    unitType: "execute-task",
    unitId: "M001/S01/T01",
    prompt: "Test prompt",
  };

  let errorCaught = false;
  try {
    await middleware(context, async () => {
      throw new Error("Test dispatch error");
    });
  } catch (err) {
    errorCaught = true;
  }

  assert(errorCaught, "error should propagate from next()");
  assert(notifications.length === 2, "should have 2 notifications (start + error)");
  assert(notifications[0].type === "info", "start notification should be info type");
  assert(notifications[1].type === "error", "error notification should be error type");
  assert(notifications[1].message.includes("Test dispatch error"), "error notification should include error message");

  cleanup();
}

// Test 8: notifications middleware includes decision info in notifications
console.log("\n=== Test 8: notifications middleware includes decision info in notifications ===");
{
  const { dir, cleanup } = createTestDir();
  const { ctx, notifications } = createMockExtensionContext();

  const middleware = createNotificationsMiddleware({
    onDispatchStart: "Dispatching {unitType} {unitId}",
    onDispatchComplete: "Completed {unitType} {unitId}",
  });
  const context = createMockDispatchContext(dir, new Set(), undefined, undefined, ctx);

  // No decision set initially
  await middleware(context, async () => {
    // Decision set during next()
    context.decision = {
      unitType: "execute-task",
      unitId: "M001/S01/T01",
      prompt: "Test prompt",
    };
  });

  // First notification should use "unknown" placeholders since decision not set yet
  assert(notifications.length === 2, "should have 2 notifications");
  assert(notifications[0].message.includes("unknown"), "start notification should use 'unknown' when no decision");
  // Second notification should have the decision info
  assert(notifications[1].message.includes("execute-task"), "complete notification should include unitType");
  assert(notifications[1].message.includes("M001/S01/T01"), "complete notification should include unitId");

  cleanup();
}

// Test 9: notifications middleware respects config stage
console.log("\n=== Test 9: notifications middleware respects config stage ===");
{
  // Test default stage
  const defaultMiddleware = createNotificationsMiddleware();
  const defaultMetadata = (defaultMiddleware as DispatchMiddleware & { __metadata?: { stage: PipelineStage; name: string } }).__metadata;

  assertEq(defaultMetadata?.stage, "notification" as PipelineStage, "default notifications middleware should have stage notification");
  assertEq(defaultMetadata?.name, "notifications", "default notifications middleware should have name 'notifications'");

  // Test custom stage
  const customMiddleware = createNotificationsMiddleware({
    stage: "post-dispatch" as PipelineStage,
    name: "custom-notifications",
  });
  const customMetadata = (customMiddleware as DispatchMiddleware & { __metadata?: { stage: PipelineStage; name: string } }).__metadata;

  assertEq(customMetadata?.stage, "post-dispatch" as PipelineStage, "custom notifications middleware should have custom stage");
  assertEq(customMetadata?.name, "custom-notifications", "custom notifications middleware should have custom name");
}

// Test 10: notifications middleware factory creates middleware correctly
console.log("\n=== Test 10: notifications middleware factory creates middleware correctly ===");
{
  // Test default configuration
  const defaultMiddleware = createNotificationsMiddleware();
  const defaultMetadata = (defaultMiddleware as DispatchMiddleware & { __metadata?: { stage: PipelineStage; name: string } }).__metadata;

  assertEq(defaultMetadata?.stage, "notification" as PipelineStage, "default middleware should have stage notification");
  assertEq(defaultMetadata?.name, "notifications", "default middleware should have name 'notifications'");

  // Test custom configuration
  const customMiddleware = createNotificationsMiddleware({
    stage: "notification" as PipelineStage,
    enabled: true,
    name: "my-notifications",
    onDispatchStart: true,
    onDispatchComplete: true,
    onError: true,
  });
  const customMetadata = (customMiddleware as DispatchMiddleware & { __metadata?: { stage: PipelineStage; name: string } }).__metadata;

  assertEq(customMetadata?.stage, "notification" as PipelineStage, "custom middleware should have stage notification");
  assertEq(customMetadata?.name, "my-notifications", "custom middleware should have custom name");

  // Test that each call returns a new instance
  const middleware1 = createNotificationsMiddleware();
  const middleware2 = createNotificationsMiddleware();

  assert(middleware1 !== middleware2, "factory should return different instances");
}

// ─── Summary ────────────────────────────────────────────────────────────────

console.log("\n" + "=".repeat(70));
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log("=".repeat(70));

if (failed > 0) {
  process.exit(1);
}
