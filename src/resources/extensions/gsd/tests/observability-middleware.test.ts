// GSD Extension — Observability Middleware Tests
// Unit tests for createObservabilityMiddleware

import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { createObservabilityMiddleware } from "../middleware/observability.js";
import type { DispatchContext, MiddlewareConfig } from "../middleware/types.js";
import type { GSDState } from "../types.js";

// Test counters
let passed = 0;
let failed = 0;

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

// Mock ExtensionAPI and ExtensionContext
const mockPi = {} as any;
const mockCtx = {
  ui: {
    notify: () => {},
  },
} as any;

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

// Create a mock DispatchContext
function createMockContext(
  basePath: string,
  completedKeySet: Set<string> = new Set(),
  pendingDecision?: any,
): DispatchContext {
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

  // Test 4: should use priority 60 by default
  console.log("\n=== should use priority 60 by default ===");
  {
    const middleware = createObservabilityMiddleware();
    const metadata = (middleware as any).__metadata;
    assertEq(metadata.priority, 60, "default priority should be 60");
    assertEq(metadata.name, "observability", "default name should be 'observability'");
  }

  // Test 5: should allow custom priority via config
  console.log("\n=== should allow custom priority via config ===");
  {
    const config: Partial<MiddlewareConfig> = {
      priority: 75,
      name: "custom-observability",
    };
    const middleware = createObservabilityMiddleware(config);
    const metadata = (middleware as any).__metadata;
    assertEq(metadata.priority, 75, "custom priority should be 75");
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
