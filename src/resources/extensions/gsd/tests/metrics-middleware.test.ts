// GSD Extension — Metrics Middleware Tests
// Tests for the metrics middleware that tracks dispatch timing.

import { createMetricsMiddleware } from "../middleware/metrics.js";
import type {
  DispatchContext,
  DispatchMiddleware,
  PipelineStage,
} from "../middleware/types.js";
import type { GSDState } from "../types.js";
import {
  passed,
  failed,
  assert,
  assertEq,
  assertNotUndefined,
  assertGte,
  assertGt,
  createTestDir,
  mockPi,
  mockCtx,
  baseState,
  createMockContext,
} from "./test-helpers.js";

// ─── Mock Factories ─────────────────────────────────────────────────────────

/**
 * Creates a mock DispatchContext with all helpers
 */
function createMockDispatchContext(
  basePath: string,
  completedKeySet: Set<string> = new Set(),
  pendingDecision?: any,
  state?: GSDState,
): DispatchContext {
  const gsdState = state ?? baseState;

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

console.log("\n=== Metrics Middleware Tests ===\n");

// Test 1: metrics middleware tracks dispatch start time
console.log("=== Test 1: metrics middleware tracks dispatch start time ===");
{
  const { dir, cleanup } = createTestDir();

  const middleware = createMetricsMiddleware();
  const context = createMockDispatchContext(dir);

  const beforeCall = Date.now();

  await middleware(context, async () => {
    // Empty next
  });

  const metrics = (context.workingState.extensions?.metrics as any)?.dispatch;

  assertNotUndefined(metrics, "metrics should be defined");
  assertNotUndefined(metrics?.dispatchStartedAt, "dispatchStartedAt should be defined");
  assertGte(metrics?.dispatchStartedAt, beforeCall, "dispatchStartedAt should be >= time before call");

  cleanup();
}

// Test 2: metrics middleware tracks dispatch end time
console.log("\n=== Test 2: metrics middleware tracks dispatch end time ===");
{
  const { dir, cleanup } = createTestDir();

  const middleware = createMetricsMiddleware();
  const context = createMockDispatchContext(dir);

  await middleware(context, async () => {
    // Empty next
  });

  const afterCall = Date.now();
  const metrics = (context.workingState.extensions?.metrics as any)?.dispatch;

  assertNotUndefined(metrics?.dispatchFinishedAt, "dispatchFinishedAt should be defined");
  assertGte(metrics?.dispatchFinishedAt, afterCall, "dispatchFinishedAt should be >= time after call");

  cleanup();
}

// Test 3: metrics middleware calculates duration
console.log("\n=== Test 3: metrics middleware calculates duration ===");
{
  const { dir, cleanup } = createTestDir();

  const middleware = createMetricsMiddleware();
  const context = createMockDispatchContext(dir);

  await middleware(context, async () => {
    // Simulate some work with a small delay
    await new Promise(resolve => setTimeout(resolve, 10));
  });

  const metrics = (context.workingState.extensions?.metrics as any)?.dispatch;

  assertNotUndefined(metrics?.duration, "duration should be defined");
  assertGte(metrics?.duration, 10, "duration should be >= 10ms");
  assertEq(typeof metrics?.duration, "number", "duration should be a number");

  cleanup();
}

// Test 4: metrics middleware stores data in context
console.log("\n=== Test 4: metrics middleware stores data in context ===");
{
  const { dir, cleanup } = createTestDir();

  const middleware = createMetricsMiddleware();
  const context = createMockDispatchContext(dir);

  await middleware(context, async () => {
    // Empty next
  });

  const metricsExtension = context.workingState.extensions?.metrics as any;

  assertNotUndefined(metricsExtension, "metrics extension should be defined");
  assertNotUndefined(metricsExtension?.dispatch, "dispatch metrics should be defined");
  assertNotUndefined(metricsExtension?.dispatch?.dispatchStartedAt, "dispatchStartedAt should be defined");
  assertNotUndefined(metricsExtension?.dispatch?.dispatchFinishedAt, "dispatchFinishedAt should be defined");
  assertNotUndefined(metricsExtension?.dispatch?.duration, "duration should be defined");

  cleanup();
}

// Test 5: metrics middleware attaches metadata to decisions
console.log("\n=== Test 5: metrics middleware attaches metadata to decisions ===");
{
  const { dir, cleanup } = createTestDir();

  const middleware = createMetricsMiddleware();
  const context = createMockDispatchContext(dir);

  await middleware(context, async () => {
    // Simulate a decision being made
    context.decision = {
      unitType: "execute-task",
      unitId: "M001/S01/T01",
      prompt: "Test prompt",
    };
  });

  const metrics = (context.workingState.extensions?.metrics as any)?.dispatch;

  assertNotUndefined(metrics, "metrics should be defined");
  assertEq(metrics?.unitType, "execute-task", "unitType should be captured");
  assertEq(metrics?.unitId, "M001/S01/T01", "unitId should be captured");
  assertNotUndefined(context.decision?.metadata?.metrics, "metrics should be attached to decision metadata");
  assertEq((context.decision?.metadata?.metrics as any)?.unitType, "execute-task", "decision metadata should have unitType");

  cleanup();
}

// Test 6: metrics middleware calls next()
console.log("\n=== Test 6: metrics middleware calls next() ===");
{
  const { dir, cleanup } = createTestDir();

  const middleware = createMetricsMiddleware();
  const context = createMockDispatchContext(dir);

  let nextCalled = false;
  await middleware(context, async () => {
    nextCalled = true;
  });

  assert(nextCalled, "next() should be called");

  cleanup();
}

// Test 7: metrics middleware handles errors gracefully
console.log("\n=== Test 7: metrics middleware handles errors gracefully ===");
{
  const { dir, cleanup } = createTestDir();

  const middleware = createMetricsMiddleware();
  const context = createMockDispatchContext(dir);

  let errorCaught = false;
  try {
    await middleware(context, async () => {
      throw new Error("Test error");
    });
  } catch {
    errorCaught = true;
  }

  // The middleware should not catch the error (it propagates)
  // but it should still record the dispatch metrics
  assert(errorCaught, "error should propagate from next()");
  // Metrics should still be recorded even if next() throws
  const metrics = (context.workingState.extensions?.metrics as any)?.dispatch;
  assertNotUndefined(metrics?.dispatchStartedAt, "dispatchStartedAt should be defined even with error");

  cleanup();
}

// Test 8: metrics middleware uses stage "post-dispatch"
console.log("\n=== Test 8: metrics middleware uses stage post-dispatch ===");
{
  const middleware = createMetricsMiddleware();
  const metadata = (middleware as DispatchMiddleware & { __metadata?: { stage: PipelineStage; name: string } }).__metadata;

  assertEq(metadata?.stage, "post-dispatch" as PipelineStage, "metrics middleware should have stage post-dispatch");
  assertEq(metadata?.name, "metrics", "metrics middleware should have name 'metrics'");
}

// Test 9: metrics middleware respects enabled/disabled config
console.log("\n=== Test 9: metrics middleware respects enabled/disabled config ===");
{
  const { dir, cleanup } = createTestDir();

  // Test disabled middleware
  const disabledMiddleware = createMetricsMiddleware({ enabled: false });
  const context = createMockDispatchContext(dir);

  await disabledMiddleware(context, async () => {
    // This should not be called
    throw new Error("next() should not be called for disabled middleware");
  });

  // Disabled middleware should not store metrics
  assert(context.workingState.extensions?.metrics === undefined, "disabled middleware should not store metrics");

  // Test enabled middleware with explicit config
  const enabledMiddleware = createMetricsMiddleware({ enabled: true, stage: "post-dispatch" as PipelineStage });
  const context2 = createMockDispatchContext(dir);

  await enabledMiddleware(context2, async () => {
    // Empty next
  });

  assert(context2.workingState.extensions?.metrics !== undefined, "enabled middleware should store metrics");
  const metadata = (enabledMiddleware as DispatchMiddleware & { __metadata?: { stage: PipelineStage } }).__metadata;
  assertEq(metadata?.stage, "post-dispatch" as PipelineStage, "enabled middleware should have stage post-dispatch");

  cleanup();
}

// Test 10: metrics middleware factory creates middleware correctly
console.log("\n=== Test 10: metrics middleware factory creates middleware correctly ===");
{
  // Test default configuration
  const defaultMiddleware = createMetricsMiddleware();
  const defaultMetadata = (defaultMiddleware as DispatchMiddleware & { __metadata?: { stage: PipelineStage; name: string } }).__metadata;

  assertEq(defaultMetadata?.stage, "post-dispatch" as PipelineStage, "default middleware should have stage post-dispatch");
  assertEq(defaultMetadata?.name, "metrics", "default middleware should have name 'metrics'");

  // Test custom configuration
  const customMiddleware = createMetricsMiddleware({
    stage: "dispatch" as PipelineStage,
    enabled: true,
    name: "custom-metrics",
  });
  const customMetadata = (customMiddleware as DispatchMiddleware & { __metadata?: { stage: PipelineStage; name: string } }).__metadata;

  assertEq(customMetadata?.stage, "dispatch" as PipelineStage, "custom middleware should have custom stage");
  assertEq(customMetadata?.name, "custom-metrics", "custom middleware should have custom name");

  // Test that each call returns a new instance
  const middleware1 = createMetricsMiddleware();
  const middleware2 = createMetricsMiddleware();

  assert(middleware1 !== middleware2, "factory should return different instances");
}

// ─── Summary ────────────────────────────────────────────────────────────────

console.log("\n" + "=".repeat(70));
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log("=".repeat(70));

if (failed > 0) {
  process.exit(1);
}
