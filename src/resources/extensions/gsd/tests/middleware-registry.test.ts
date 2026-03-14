// GSD Extension — Middleware Registry Tests
// Tests for the unified middleware registration API

import {
  registerDispatchMiddleware,
  getRegisteredDispatchMiddlewares,
  clearRegisteredDispatchMiddlewares,
  composeDispatchMiddlewares,
  createIdempotencyMiddleware,
} from "../middleware/index.js";
import type { DispatchMiddleware, DispatchContext, GSDMiddleware, PipelineStage } from "../middleware/types.js";

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
  stage: PipelineStage,
  enabled: boolean = true,
): DispatchMiddleware {
  const middleware: DispatchMiddleware = async (context, next) => {
    await next();
  };
  (middleware as DispatchMiddleware & { __metadata?: { name: string; stage: PipelineStage } }).__metadata = {
    name,
    stage,
  };
  return middleware;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

console.log("\n=== Middleware Registry Tests ===\n");

// Test 1: registerDispatchMiddleware adds middleware to registry
console.log("=== Test 1: registerDispatchMiddleware adds middleware to registry ===");
{
  clearRegisteredDispatchMiddlewares();

  const middleware = createTestMiddleware("test-middleware", "dispatch");
  registerDispatchMiddleware({
    name: "test-middleware",
    stage: "dispatch",
    enabled: true,
    middleware,
  });

  const registered = getRegisteredDispatchMiddlewares();
  assertEq(registered.length, 1, "should have 1 registered middleware");
  assertEq(registered[0].name, "test-middleware", "middleware name should match");
  assertEq(registered[0].stage, "dispatch", "middleware stage should match");
  assertEq(registered[0].enabled, true, "middleware should be enabled");
  assertNotNull(registered[0].middleware, "middleware function should be present");
}

// Test 2: registerDispatchMiddleware deduplicates by name
console.log("\n=== Test 2: registerDispatchMiddleware deduplicates by name ===");
{
  clearRegisteredDispatchMiddlewares();

  const middleware1 = createTestMiddleware("dedup-test", "pre-dispatch");
  const middleware2 = createTestMiddleware("dedup-test", "post-dispatch");

  registerDispatchMiddleware({
    name: "dedup-test",
    stage: "pre-dispatch",
    enabled: true,
    middleware: middleware1,
  });

  // Register again with same name but different stage
  registerDispatchMiddleware({
    name: "dedup-test",
    stage: "post-dispatch",
    enabled: true,
    middleware: middleware2,
  });

  const registered = getRegisteredDispatchMiddlewares();
  assertEq(registered.length, 1, "should deduplicate by name");
  assertEq(registered[0].stage, "post-dispatch", "should use the later registration's stage");
  assertEq(registered[0].middleware, middleware2, "should use the later registration's middleware");
}

// Test 3: getRegisteredDispatchMiddlewares sorts by stage
console.log("\n=== Test 3: getRegisteredDispatchMiddlewares sorts by stage ===");
{
  clearRegisteredDispatchMiddlewares();

  registerDispatchMiddleware({
    name: "late-stage",
    stage: "notification",
    enabled: true,
    middleware: createTestMiddleware("late-stage", "notification"),
  });

  registerDispatchMiddleware({
    name: "early-stage",
    stage: "pre-validation",
    enabled: true,
    middleware: createTestMiddleware("early-stage", "pre-validation"),
  });

  registerDispatchMiddleware({
    name: "middle-stage",
    stage: "dispatch",
    enabled: true,
    middleware: createTestMiddleware("middle-stage", "dispatch"),
  });

  const registered = getRegisteredDispatchMiddlewares();

  assertEq(registered.length, 3, "should have 3 registered middlewares");
  assertEq(registered[0].name, "early-stage", "first should be early-stage (pre-validation)");
  assertEq(registered[1].name, "middle-stage", "second should be middle-stage (dispatch)");
  assertEq(registered[2].name, "late-stage", "third should be late-stage (notification)");
}

// Test 4: composeDispatchMiddlewares includes registered custom middlewares
console.log("\n=== Test 4: composeDispatchMiddlewares includes registered custom middlewares ===");
{
  clearRegisteredDispatchMiddlewares();

  // Register a custom middleware
  registerDispatchMiddleware({
    name: "custom-middleware",
    stage: "dispatch",
    enabled: true,
    middleware: createTestMiddleware("custom-middleware", "dispatch"),
  });

  const composed = composeDispatchMiddlewares();

  // Should have 11 built-in + 1 custom = 12 middlewares
  assertEq(composed.length, 12, "should have 12 middlewares (11 built-in + 1 custom)");

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
    stage: "dispatch",
    enabled: true,
    middleware: createTestMiddleware("enabled-middleware", "dispatch"),
  });

  // Register a disabled middleware
  registerDispatchMiddleware({
    name: "disabled-middleware",
    stage: "dispatch",
    enabled: false,
    middleware: createTestMiddleware("disabled-middleware", "dispatch"),
  });

  const composed = composeDispatchMiddlewares();

  // Should have 11 built-in + 1 enabled = 12 middlewares (disabled filtered out)
  assertEq(composed.length, 12, "should have 12 middlewares (disabled filtered out)");

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
    idempotency as DispatchMiddleware & { __metadata?: { name: string; stage: PipelineStage } }
  ).__metadata;

  assertNotNull(idempotencyMetadata, "idempotency middleware should have metadata");
  if (idempotencyMetadata) {
    assertEq(idempotencyMetadata.name, "idempotency", "idempotency middleware name should be correct");
    assertEq(idempotencyMetadata.stage, "pre-validation", "idempotency middleware stage should be pre-validation");
  }

  // Test that composeDispatchMiddlewares returns the expected built-in middlewares
  const composed = composeDispatchMiddlewares();
  assertEq(composed.length, 11, "should have 11 built-in middlewares");

  // Verify expected stages
  const stages = composed.map(
    (m) =>
      (m as DispatchMiddleware & { __metadata?: { stage: PipelineStage } }).__metadata?.stage,
  );

  assertEq(stages[0], "pre-validation", "first middleware should have stage pre-validation (idempotency)");
  assertEq(stages[1], "validation", "second middleware should have stage validation");
  assertEq(stages[2], "pre-dispatch", "third middleware should have stage pre-dispatch (budget-ceiling)");
  assertEq(stages[3], "pre-dispatch", "fourth middleware should have stage pre-dispatch (merge-guard)");
  assertEq(stages[4], "dispatch", "fifth middleware should have stage dispatch (uat-dispatch)");
  assertEq(stages[5], "dispatch", "sixth middleware should have stage dispatch (reassessment)");
  assertEq(stages[6], "dispatch", "seventh middleware should have stage dispatch (phase-dispatch)");
  assertEq(stages[7], "dispatch", "eighth middleware should have stage dispatch (code-review)");
  assertEq(stages[8], "post-dispatch", "ninth middleware should have stage post-dispatch (metrics)");
  assertEq(stages[9], "post-dispatch", "tenth middleware should have stage post-dispatch (observability)");
  assertEq(stages[10], "notification", "eleventh middleware should have stage notification");
}

// Test 7: registerDispatchMiddleware defaults stage to dispatch
console.log("\n=== Test 7: registerDispatchMiddleware defaults stage to dispatch ===");
{
  clearRegisteredDispatchMiddlewares();

  registerDispatchMiddleware({
    name: "default-stage",
    middleware: createTestMiddleware("default-stage", "dispatch"),
  });

  const registered = getRegisteredDispatchMiddlewares();
  assertEq(registered[0].stage, "dispatch", "default stage should be dispatch");
}

// Test 8: registerDispatchMiddleware defaults enabled to true
console.log("\n=== Test 8: registerDispatchMiddleware defaults enabled to true ===");
{
  clearRegisteredDispatchMiddlewares();

  registerDispatchMiddleware({
    name: "default-enabled",
    middleware: createTestMiddleware("default-enabled", "dispatch"),
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
    stage: "dispatch",
    enabled: true,
    middleware: createTestMiddleware("to-clear", "dispatch"),
  });

  assertEq(getRegisteredDispatchMiddlewares().length, 1, "should have 1 middleware");

  clearRegisteredDispatchMiddlewares();

  assertEq(getRegisteredDispatchMiddlewares().length, 0, "should have 0 middlewares after clear");
}

// Test 10: custom middleware executes in correct stage order
console.log("\n=== Test 10: custom middleware executes in correct stage order ===");
{
  clearRegisteredDispatchMiddlewares();

  // Create a custom middleware with metadata attached
  const customMiddleware: DispatchMiddleware = async (context, next) => {
    await next();
  };
  (customMiddleware as DispatchMiddleware & { __metadata?: { name: string; stage: PipelineStage } }).__metadata = {
    name: "custom-execution-test",
    stage: "dispatch",
  };

  // Register a custom middleware with stage "dispatch" (same as uat-dispatch)
  registerDispatchMiddleware({
    name: "custom-execution-test",
    stage: "dispatch",
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
  // Custom middlewares are appended after built-in middlewares, then sorted by stage
  // So custom "dispatch" middlewares come after all built-in "dispatch" middlewares
  assert(customIndex > uatIndex, "custom middleware should come after uat-dispatch");
  assert(customIndex > reassessmentIndex, "custom middleware should come after reassessment");
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
    stage: "post-dispatch",
    enabled: true,
    middleware: gsdMiddleware,
  });

  const registered = getRegisteredDispatchMiddlewares();
  assertEq(registered.length, 1, "should have 1 registered middleware");
  assertEq(registered[0].name, "gsd-middleware-test", "GSDMiddleware should be registered");
  assertEq(registered[0].stage, "post-dispatch", "GSDMiddleware stage should be preserved");
}

// Test 12: custom middlewares are sorted correctly relative to built-in middlewares
console.log("\n=== Test 12: custom middlewares are sorted correctly relative to built-in middlewares ===");
{
  clearRegisteredDispatchMiddlewares();

  // Register custom middleware at stage "pre-dispatch" (should run with budget-ceiling and merge-guard)
  registerDispatchMiddleware({
    name: "custom-pre-dispatch",
    stage: "pre-dispatch",
    enabled: true,
    middleware: async (context, next) => {
      await next();
    },
  });

  // Register custom middleware at stage "post-dispatch" (should run with code-review, metrics, observability)
  registerDispatchMiddleware({
    name: "custom-post-dispatch",
    stage: "post-dispatch",
    enabled: true,
    middleware: async (context, next) => {
      await next();
    },
  });

  const composed = composeDispatchMiddlewares();

  // Find positions of middlewares
  const budgetCeilingIndex = composed.findIndex(
    (m) =>
      (m as DispatchMiddleware & { __metadata?: { name: string } }).__metadata?.name ===
      "budget-ceiling",
  );
  const customPreIndex = composed.findIndex(
    (m) =>
      (m as DispatchMiddleware & { __metadata?: { name: string } }).__metadata?.name ===
      "custom-pre-dispatch",
  );
  const uatIndex = composed.findIndex(
    (m) =>
      (m as DispatchMiddleware & { __metadata?: { name: string } }).__metadata?.name ===
      "uat-dispatch",
  );
  const codeReviewIndex = composed.findIndex(
    (m) =>
      (m as DispatchMiddleware & { __metadata?: { name: string } }).__metadata?.name ===
      "code-review",
  );
  const customPostIndex = composed.findIndex(
    (m) =>
      (m as DispatchMiddleware & { __metadata?: { name: string } }).__metadata?.name ===
      "custom-post-dispatch",
  );
  const metricsIndex = composed.findIndex(
    (m) =>
      (m as DispatchMiddleware & { __metadata?: { name: string } }).__metadata?.name ===
      "metrics",
  );

  // Verify positions exist
  assert(budgetCeilingIndex >= 0, "budget-ceiling should be in composed list");
  assert(customPreIndex >= 0, "custom-pre-dispatch should be in composed list");
  assert(uatIndex >= 0, "uat-dispatch should be in composed list");
  assert(codeReviewIndex >= 0, "code-review should be in composed list");
  assert(customPostIndex >= 0, "custom-post-dispatch should be in composed list");
  assert(metricsIndex >= 0, "metrics should be in composed list");

  // Verify correct ordering by stage:
  // pre-dispatch (budget-ceiling, custom-pre-dispatch) < dispatch (uat-dispatch) < post-dispatch (code-review, custom-post-dispatch, metrics)
  assert(budgetCeilingIndex < uatIndex, "budget-ceiling (pre-dispatch) should come before uat-dispatch (dispatch)");
  assert(customPreIndex < uatIndex, "custom-pre-dispatch (pre-dispatch) should come before uat-dispatch (dispatch)");
  assert(uatIndex < codeReviewIndex, "uat-dispatch (dispatch) should come before code-review (post-dispatch)");
  assert(uatIndex < customPostIndex, "uat-dispatch (dispatch) should come before custom-post-dispatch (post-dispatch)");
  assert(codeReviewIndex < metricsIndex, "code-review (post-dispatch) should come before metrics (post-dispatch)");

  // Verify the stage metadata is correctly attached
  const customPreMiddleware = composed[customPreIndex];
  const customPreStage = (customPreMiddleware as DispatchMiddleware & { __metadata?: { stage: PipelineStage } }).__metadata?.stage;
  assertEq(customPreStage, "pre-dispatch", "custom-pre-dispatch middleware should have stage pre-dispatch");

  const customPostMiddleware = composed[customPostIndex];
  const customPostStage = (customPostMiddleware as DispatchMiddleware & { __metadata?: { stage: PipelineStage } }).__metadata?.stage;
  assertEq(customPostStage, "post-dispatch", "custom-post-dispatch middleware should have stage post-dispatch");
}

// ─── Summary ────────────────────────────────────────────────────────────────

console.log("\n" + "=".repeat(70));
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log("=".repeat(70));

if (failed > 0) {
  process.exit(1);
}
