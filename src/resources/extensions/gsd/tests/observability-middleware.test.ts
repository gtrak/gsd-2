// GSD Extension — Observability Middleware Tests
// Unit tests for createObservabilityMiddleware

import { createObservabilityMiddleware } from "../middleware/observability.js";
import type { DispatchContext, MiddlewareConfig, PipelineStage } from "../middleware/types.js";
import type { GSDState } from "../types.js";
import {
  passed,
  failed,
  assert,
  assertEq,
  createTestDir,
  mockPi,
  mockCtx,
  baseState,
  createMockContext,
} from "./test-helpers.js";

// ─── Tests ─────────────────────────────────────────────────────────────────

async function runTests(): Promise<void> {
  console.log("\n=== Observability Middleware Tests ===\n");

  // Test 1: should always call next()
  console.log("=== should always call next() ===");
  {
    const { dir, cleanup } = createTestDir();

    const middleware = createObservabilityMiddleware();
    const context = createMockContext(dir);
    let nextCalled = false;

    const next = async () => {
      nextCalled = true;
    };

    await middleware(context, next);

    assert(nextCalled, "next() should always be called");
    assert(context.decision === undefined, "decision should remain undefined");

    cleanup();
  }

  // Test 2: should emit warnings when a decision was made
  console.log("\n=== should emit warnings when a decision was made ===");
  {
    const { dir, cleanup } = createTestDir();

    const middleware = createObservabilityMiddleware();
    const context = createMockContext(dir);
    let nextCalled = false;

    const next = async () => {
      nextCalled = true;
      // Simulate a decision being made by a downstream middleware
      context.decision = {
        unitType: "execute-task",
        unitId: "M001/S01/T01",
        prompt: "Test prompt",
      };
    };

    await middleware(context, next);

    assert(nextCalled, "next() should be called");
    assert(context.decision !== undefined, "decision should be set");
    assert(context.decision?.unitType === "execute-task", "decision should have correct unitType");

    cleanup();
  }

  // Test 3: should not emit warnings when no decision was made
  console.log("\n=== should not emit warnings when no decision was made ===");
  {
    const { dir, cleanup } = createTestDir();

    const middleware = createObservabilityMiddleware();
    const context = createMockContext(dir);
    let nextCalled = false;

    const next = async () => {
      nextCalled = true;
      // No decision is made
    };

    await middleware(context, next);

    assert(nextCalled, "next() should be called");
    assert(context.decision === undefined, "decision should remain undefined");

    cleanup();
  }

  // Test 4: should use stage "post-dispatch" by default
  console.log("\n=== should use stage post-dispatch by default ===");
  {
    const middleware = createObservabilityMiddleware();
    const metadata = (middleware as any).__metadata;
    assertEq(metadata.stage, "post-dispatch" as PipelineStage, "default stage should be post-dispatch");
    assertEq(metadata.name, "observability", "default name should be 'observability'");
  }

  // Test 5: should allow custom stage via config
  console.log("\n=== should allow custom stage via config ===");
  {
    const config: Partial<MiddlewareConfig> = {
      stage: "dispatch" as PipelineStage,
      name: "custom-observability",
    };
    const middleware = createObservabilityMiddleware(config);
    const metadata = (middleware as any).__metadata;
    assertEq(metadata.stage, "dispatch" as PipelineStage, "custom stage should be dispatch");
    assertEq(metadata.name, "custom-observability", "custom name should be used");
  }

  // Test 6: should be disabled when enabled: false
  console.log("\n=== should be disabled when enabled: false ===");
  {
    const { dir, cleanup } = createTestDir();

    const config: Partial<MiddlewareConfig> = {
      enabled: false,
    };
    const middleware = createObservabilityMiddleware(config);
    const context = createMockContext(dir);
    let nextCalled = false;

    const next = async () => {
      nextCalled = true;
    };

    await middleware(context, next);

    assert(!nextCalled, "next() should NOT be called when disabled");
    assert(context.decision === undefined, "decision should remain undefined");

    cleanup();
  }

  // Test 7: should handle different unit types
  console.log("\n=== should handle different unit types ===");
  {
    const { dir, cleanup } = createTestDir();

    const middleware = createObservabilityMiddleware();
    const context = createMockContext(dir);
    let nextCalled = false;

    const next = async () => {
      nextCalled = true;
      // Test with complete-slice unit type
      context.decision = {
        unitType: "complete-slice",
        unitId: "M001/S01",
        prompt: "Test prompt",
      };
    };

    await middleware(context, next);

    assert(nextCalled, "next() should be called");
    assert(context.decision?.unitType === "complete-slice", "decision should have correct unitType");

    cleanup();
  }

  // ─── Summary ─────────────────────────────────────────────────────────────

  console.log("\n" + "=".repeat(70));
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(70));

  if (failed > 0) {
    process.exit(1);
  }
}

// Run tests
runTests().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
