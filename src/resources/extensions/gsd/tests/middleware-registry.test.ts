// GSD Extension — Middleware Registry Tests
// Tests for the unified middleware registration API

import {
  registerDispatchMiddleware,
  getRegisteredDispatchMiddlewares,
  clearRegisteredDispatchMiddlewares,
  composeDispatchMiddlewares,
  createIdempotencyMiddleware,
} from "../middleware/index.js";
import type { DispatchMiddleware, DispatchContext, GSDMiddleware } from "../middleware/types.js";

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
  if (actual !== null && actual !== undefined) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${message} — expected not null/undefined`);
  }
}

// ─── Mock Factories ─────────────────────────────────────────────────────────

/**
 * Creates a mock DispatchContext for testing
 */
function createMockDispatchContext(): DispatchContext {
  return {
    basePath: "/test",
    pi: {} as any,
    ctx: {} as any,
    state: {
      activeMilestone: { id: "M001", title: "Test" },
      activeSlice: { id: "S01", title: "Test" },
      activeTask: { id: "T01", title: "Test" },
      phase: "executing",
      recentDecisions: [],
      blockers: [],
      nextAction: "test",
      registry: [],
      extensions: {},
    },
    workingState: {
      activeMilestone: { id: "M001", title: "Test" },
      activeSlice: { id: "S01", title: "Test" },
      activeTask: { id: "T01", title: "Test" },
      phase: "executing",
      recentDecisions: [],
      blockers: [],
      nextAction: "test",
      registry: [],
      extensions: {},
    },
    getExtensionData: () => undefined,
    setExtensionData: () => {},
    resolveTaskFile: () => null,
    resolveSliceFile: () => null,
    resolveMilestoneFile: () => null,
    completedKeySet: new Set(),
    getCompletedKey: () => "",
    isUnitCompleted: () => false,
  };
}

/**
 * Creates a test middleware with metadata
 */
function createTestMiddleware(
  name: string,
  priority: number,
  enabled: boolean = true,
): DispatchMiddleware {
  const middleware: DispatchMiddleware = async (context, next) => {
    await next();
  };
  (middleware as DispatchMiddleware & { __metadata?: { name: string; priority: number } }).__metadata = {
    name,
    priority,
  };
  return middleware;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

console.log("\n=== Middleware Registry Tests ===\n");

// Test 1: registerDispatchMiddleware adds middleware to registry
console.log("=== Test 1: registerDispatchMiddleware adds middleware to registry ===");
{
  clearRegisteredDispatchMiddlewares();

  const middleware = createTestMiddleware("test-middleware", 75);
  registerDispatchMiddleware({
    name: "test-middleware",
    priority: 75,
    enabled: true,
    middleware,
  });

  const registered = getRegisteredDispatchMiddlewares();
  assertEq(registered.length, 1, "should have 1 registered middleware");
  assertEq(registered[0].name, "test-middleware", "middleware name should match");
  assertEq(registered[0].priority, 75, "middleware priority should match");
  assertEq(registered[0].enabled, true, "middleware should be enabled");
  assertNotNull(registered[0].middleware, "middleware function should be present");
}

// Test 2: registerDispatchMiddleware deduplicates by name
console.log("\n=== Test 2: registerDispatchMiddleware deduplicates by name ===");
{
  clearRegisteredDispatchMiddlewares();

  const middleware1 = createTestMiddleware("dedup-test", 50);
  const middleware2 = createTestMiddleware("dedup-test", 80);

  registerDispatchMiddleware({
    name: "dedup-test",
    priority: 50,
    enabled: true,
    middleware: middleware1,
  });

  // Register again with same name but different priority
  registerDispatchMiddleware({
    name: "dedup-test",
    priority: 80,
    enabled: true,
    middleware: middleware2,
  });

  const registered = getRegisteredDispatchMiddlewares();
  assertEq(registered.length, 1, "should deduplicate by name");
  assertEq(registered[0].priority, 80, "should use the later registration's priority");
  assertEq(registered[0].middleware, middleware2, "should use the later registration's middleware");
}

// Test 3: getRegisteredDispatchMiddlewares sorts by priority
console.log("\n=== Test 3: getRegisteredDispatchMiddlewares sorts by priority ===");
{
  clearRegisteredDispatchMiddlewares();

  registerDispatchMiddleware({
    name: "low-priority",
    priority: 10,
    enabled: true,
    middleware: createTestMiddleware("low-priority", 10),
  });

  registerDispatchMiddleware({
    name: "high-priority",
    priority: 90,
    enabled: true,
    middleware: createTestMiddleware("high-priority", 90),
  });

  registerDispatchMiddleware({
    name: "medium-priority",
    priority: 50,
    enabled: true,
    middleware: createTestMiddleware("medium-priority", 50),
  });

  const registered = getRegisteredDispatchMiddlewares();

  assertEq(registered.length, 3, "should have 3 registered middlewares");
  assertEq(registered[0].name, "high-priority", "first should be high-priority");
  assertEq(registered[1].name, "medium-priority", "second should be medium-priority");
  assertEq(registered[2].name, "low-priority", "third should be low-priority");
}

// Test 4: composeDispatchMiddlewares includes registered custom middlewares
console.log("\n=== Test 4: composeDispatchMiddlewares includes registered custom middlewares ===");
{
  clearRegisteredDispatchMiddlewares();

  // Register a custom middleware
  registerDispatchMiddleware({
    name: "custom-middleware",
    priority: 85,
    enabled: true,
    middleware: createTestMiddleware("custom-middleware", 85),
  });

  const composed = composeDispatchMiddlewares();

  // Should have 8 built-in + 1 custom = 9 middlewares
  assertEq(composed.length, 9, "should have 9 middlewares (8 built-in + 1 custom)");

  // Find the custom middleware in the composed list
  const customMiddleware = composed.find(
    (m) =>
      (m as DispatchMiddleware & { __metadata?: { name: string } }).__metadata?.name ===
      "custom-middleware",
  );
  assertNotNull(customMiddleware, "custom middleware should be in composed list");
}

// Test 5: disabled middlewares are filtered out
console.log("\n=== Test 5: disabled middlewares are filtered out ===");
{
  clearRegisteredDispatchMiddlewares();

  // Register an enabled middleware
  registerDispatchMiddleware({
    name: "enabled-middleware",
    priority: 85,
    enabled: true,
    middleware: createTestMiddleware("enabled-middleware", 85),
  });

  // Register a disabled middleware
  registerDispatchMiddleware({
    name: "disabled-middleware",
    priority: 75,
    enabled: false,
    middleware: createTestMiddleware("disabled-middleware", 75),
  });

  const composed = composeDispatchMiddlewares();

  // Should have 8 built-in + 1 enabled = 9 middlewares (disabled filtered out)
  assertEq(composed.length, 9, "should have 9 middlewares (disabled filtered out)");

  // Verify enabled middleware is present
  const enabledMiddleware = composed.find(
    (m) =>
      (m as DispatchMiddleware & { __metadata?: { name: string } }).__metadata?.name ===
      "enabled-middleware",
  );
  assertNotNull(enabledMiddleware, "enabled middleware should be in composed list");

  // Verify disabled middleware is NOT present
  const disabledMiddleware = composed.find(
    (m) =>
      (m as DispatchMiddleware & { __metadata?: { name: string } }).__metadata?.name ===
      "disabled-middleware",
  );
  assert(disabledMiddleware === undefined, "disabled middleware should NOT be in composed list");
}

// Test 6: backward compatibility - existing middleware factories still work
console.log("\n=== Test 6: backward compatibility - existing middleware factories still work ===");
{
  clearRegisteredDispatchMiddlewares();

  // Test that all middleware factories still work
  const idempotency = createIdempotencyMiddleware();
  const idempotencyMetadata = (
    idempotency as DispatchMiddleware & { __metadata?: { name: string; priority: number } }
  ).__metadata;

  assertNotNull(idempotencyMetadata, "idempotency middleware should have metadata");
  if (idempotencyMetadata) {
    assertEq(idempotencyMetadata.name, "idempotency", "idempotency middleware name should be correct");
    assertEq(idempotencyMetadata.priority, 100, "idempotency middleware priority should be 100");
  }

  // Test that composeDispatchMiddlewares returns the expected built-in middlewares
  const composed = composeDispatchMiddlewares();
  assertEq(composed.length, 8, "should have 8 built-in middlewares");

  // Verify expected priorities
  const priorities = composed.map(
    (m) =>
      (m as DispatchMiddleware & { __metadata?: { priority: number } }).__metadata?.priority,
  );

  assertEq(priorities[0], 100, "first middleware should have priority 100 (idempotency)");
  assertEq(priorities[1], 95, "second middleware should have priority 95 (budget-ceiling)");
  assertEq(priorities[2], 90, "third middleware should have priority 90 (merge-guard)");
  assertEq(priorities[3], 85, "fourth middleware should have priority 85 (uat-dispatch)");
  assertEq(priorities[4], 80, "fifth middleware should have priority 80 (reassessment)");
  assertEq(priorities[5], 75, "sixth middleware should have priority 75 (phase-dispatch)");
  assertEq(priorities[6], 70, "seventh middleware should have priority 70 (code-review)");
  assertEq(priorities[7], 60, "eighth middleware should have priority 60 (observability)");
}

// Test 7: registerDispatchMiddleware defaults priority to 50
console.log("\n=== Test 7: registerDispatchMiddleware defaults priority to 50 ===");
{
  clearRegisteredDispatchMiddlewares();

  registerDispatchMiddleware({
    name: "default-priority",
    middleware: createTestMiddleware("default-priority", 50),
  });

  const registered = getRegisteredDispatchMiddlewares();
  assertEq(registered[0].priority, 50, "default priority should be 50");
}

// Test 8: registerDispatchMiddleware defaults enabled to true
console.log("\n=== Test 8: registerDispatchMiddleware defaults enabled to true ===");
{
  clearRegisteredDispatchMiddlewares();

  registerDispatchMiddleware({
    name: "default-enabled",
    middleware: createTestMiddleware("default-enabled", 50),
  });

  const registered = getRegisteredDispatchMiddlewares();
  assertEq(registered[0].enabled, true, "default enabled should be true");
}

// Test 9: clearRegisteredDispatchMiddlewares clears the registry
console.log("\n=== Test 9: clearRegisteredDispatchMiddlewares clears the registry ===");
{
  clearRegisteredDispatchMiddlewares();

  registerDispatchMiddleware({
    name: "to-clear",
    priority: 75,
    enabled: true,
    middleware: createTestMiddleware("to-clear", 75),
  });

  assertEq(getRegisteredDispatchMiddlewares().length, 1, "should have 1 middleware");

  clearRegisteredDispatchMiddlewares();

  assertEq(getRegisteredDispatchMiddlewares().length, 0, "should have 0 middlewares after clear");
}

// Test 10: custom middleware executes in correct priority order
console.log("\n=== Test 10: custom middleware executes in correct priority order ===");
{
  clearRegisteredDispatchMiddlewares();

  // Create a custom middleware with metadata attached
  const customMiddleware: DispatchMiddleware = async (context, next) => {
    await next();
  };
  (customMiddleware as DispatchMiddleware & { __metadata?: { name: string; priority: number } }).__metadata = {
    name: "custom-execution-test",
    priority: 85,
  };

  // Register a custom middleware with priority 85 (same as uat-dispatch)
  registerDispatchMiddleware({
    name: "custom-execution-test",
    priority: 85,
    enabled: true,
    middleware: customMiddleware,
  });

  // We can't easily test execution order without running the full chain,
  // but we can verify the middleware is in the correct position in the composed list
  const composed = composeDispatchMiddlewares();

  // Find positions
  const uatIndex = composed.findIndex(
    (m) =>
      (m as DispatchMiddleware & { __metadata?: { name: string } }).__metadata?.name ===
      "uat-dispatch",
  );
  const customIndex = composed.findIndex(
    (m) =>
      (m as DispatchMiddleware & { __metadata?: { name: string } }).__metadata?.name ===
      "custom-execution-test",
  );
  const reassessmentIndex = composed.findIndex(
    (m) =>
      (m as DispatchMiddleware & { __metadata?: { name: string } }).__metadata?.name ===
      "reassessment",
  );

  assert(uatIndex >= 0, "uat-dispatch should be in composed list");
  assert(customIndex >= 0, "custom middleware should be in composed list");
  assert(reassessmentIndex >= 0, "reassessment should be in composed list");
  // Both have priority 85, so they should be adjacent (order depends on array sort stability)
  assert(Math.abs(customIndex - uatIndex) <= 1, "custom middleware should be adjacent to uat-dispatch (both priority 85)");
  assert(reassessmentIndex > customIndex, "reassessment should come after custom middleware");
}

// Test 11: GSDMiddleware type can be registered
console.log("\n=== Test 11: GSDMiddleware type can be registered ===");
{
  clearRegisteredDispatchMiddlewares();

  // Create a GSDMiddleware (uses HookContext instead of DispatchContext)
  const gsdMiddleware: GSDMiddleware = async (context, next) => {
    await next();
  };

  registerDispatchMiddleware({
    name: "gsd-middleware-test",
    priority: 65,
    enabled: true,
    middleware: gsdMiddleware,
  });

  const registered = getRegisteredDispatchMiddlewares();
  assertEq(registered.length, 1, "should have 1 registered middleware");
  assertEq(registered[0].name, "gsd-middleware-test", "GSDMiddleware should be registered");
  assertEq(registered[0].priority, 65, "GSDMiddleware priority should be preserved");
}

// Test 12: custom middlewares are sorted correctly relative to built-in middlewares
console.log("\n=== Test 12: custom middlewares are sorted correctly relative to built-in middlewares ===");
{
  clearRegisteredDispatchMiddlewares();

  // Register custom middleware at priority 88 (should run after UAT middleware at 85)
  registerDispatchMiddleware({
    name: "custom-high-priority",
    priority: 88,
    enabled: true,
    middleware: async (context, next) => {
      await next();
    },
  });

  // Register custom middleware at priority 78 (should run before phase-dispatch at 75)
  registerDispatchMiddleware({
    name: "custom-medium-priority",
    priority: 78,
    enabled: true,
    middleware: async (context, next) => {
      await next();
    },
  });

  const composed = composeDispatchMiddlewares();

  // Find positions of middlewares
  const mergeGuardIndex = composed.findIndex(
    (m) =>
      (m as DispatchMiddleware & { __metadata?: { name: string } }).__metadata?.name ===
      "merge-guard",
  );
  const customHighIndex = composed.findIndex(
    (m) =>
      (m as DispatchMiddleware & { __metadata?: { name: string } }).__metadata?.name ===
      "custom-high-priority",
  );
  const uatIndex = composed.findIndex(
    (m) =>
      (m as DispatchMiddleware & { __metadata?: { name: string } }).__metadata?.name ===
      "uat-dispatch",
  );
  const reassessmentIndex = composed.findIndex(
    (m) =>
      (m as DispatchMiddleware & { __metadata?: { name: string } }).__metadata?.name ===
      "reassessment",
  );
  const customMediumIndex = composed.findIndex(
    (m) =>
      (m as DispatchMiddleware & { __metadata?: { name: string } }).__metadata?.name ===
      "custom-medium-priority",
  );
  const phaseDispatchIndex = composed.findIndex(
    (m) =>
      (m as DispatchMiddleware & { __metadata?: { name: string } }).__metadata?.name ===
      "phase-dispatch",
  );

  // Verify positions exist
  assert(mergeGuardIndex >= 0, "merge-guard should be in composed list");
  assert(customHighIndex >= 0, "custom-high-priority should be in composed list");
  assert(uatIndex >= 0, "uat-dispatch should be in composed list");
  assert(reassessmentIndex >= 0, "reassessment should be in composed list");
  assert(customMediumIndex >= 0, "custom-medium-priority should be in composed list");
  assert(phaseDispatchIndex >= 0, "phase-dispatch should be in composed list");

  // Verify correct ordering:
  // merge-guard (90) > custom-high-priority (88) > uat-dispatch (85) > reassessment (80) > custom-medium-priority (78) > phase-dispatch (75)
  assert(mergeGuardIndex < customHighIndex, "merge-guard (90) should come before custom-high-priority (88)");
  assert(customHighIndex < uatIndex, "custom-high-priority (88) should come before uat-dispatch (85)");
  assert(uatIndex < reassessmentIndex, "uat-dispatch (85) should come before reassessment (80)");
  assert(reassessmentIndex < customMediumIndex, "reassessment (80) should come before custom-medium-priority (78)");
  assert(customMediumIndex < phaseDispatchIndex, "custom-medium-priority (78) should come before phase-dispatch (75)");

  // Verify the priority metadata is correctly attached
  const customHighMiddleware = composed[customHighIndex];
  const customHighPriority = (customHighMiddleware as DispatchMiddleware & { __metadata?: { priority: number } }).__metadata?.priority;
  assertEq(customHighPriority, 88, "custom-high-priority middleware should have priority 88");

  const customMediumMiddleware = composed[customMediumIndex];
  const customMediumPriority = (customMediumMiddleware as DispatchMiddleware & { __metadata?: { priority: number } }).__metadata?.priority;
  assertEq(customMediumPriority, 78, "custom-medium-priority middleware should have priority 78");
}

// ─── Summary ────────────────────────────────────────────────────────────────

console.log("\n" + "=".repeat(70));
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log("=".repeat(70));

if (failed > 0) {
  process.exit(1);
}
