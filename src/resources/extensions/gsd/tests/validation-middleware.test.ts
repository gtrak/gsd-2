// GSD Extension — Validation Middleware Tests
// Unit tests for createValidationMiddleware

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { GSDState, Phase } from "../types.js";
import {
  passed,
  failed,
  assert,
  assertEq,
  assertNotUndefined,
  assertGt,
  createTestDir,
} from "./test-helpers.js";

// Test counters
let pendingTests = 0;

// Mock ExtensionAPI
const mockPi = {} as any;

// Create a mock context factory that uses a local notifyMessages array
function createMockContext(
  basePath: string,
  state: GSDState = {
    activeMilestone: { id: "M001", title: "Test Milestone" },
    activeSlice: { id: "S01", title: "Test Slice" },
    activeTask: { id: "T01", title: "Test Task" },
    phase: "executing",
    recentDecisions: [],
    blockers: [],
    nextAction: "test",
    registry: [],
    extensions: {},
  },
  pendingDecision?: any,
): { context: any; notifyMessages: { message: string; type: string }[] } {
  const notifyMessages: { message: string; type: string }[] = [];
  const mockCtx = {
    ui: {
      notify: (message: string, type: string) => {
        notifyMessages.push({ message, type });
      },
    },
  } as any;

  return {
    context: {
      basePath,
      pi: mockPi,
      ctx: mockCtx,
      state,
      workingState: { ...state },
      getExtensionData: () => undefined,
      setExtensionData: () => {},
      resolveTaskFile: () => null,
      resolveSliceFile: () => null,
      resolveMilestoneFile: () => null,
      completedKeySet: new Set<string>(),
      pendingDecision,
      getCompletedKey: (unitType: string, unitId: string) => `${unitType}/${unitId}`,
      isUnitCompleted: (unitType: string, unitId: string) => false,
    },
    notifyMessages,
  };
}

// Save the original working directory
const originalCwd = process.cwd();

// ─── Tests ─────────────────────────────────────────────────────────────────

console.log("\n=== Validation Middleware Tests ===\n");

// Test 1: validation middleware runs before dispatch
console.log("=== validation middleware runs before dispatch ===");
{
  pendingTests++;
  const { dir, cleanup } = createTestDir();

  import("../middleware/validation.js").then(async ({ createValidationMiddleware }) => {
    const middleware = createValidationMiddleware();
    const { context, notifyMessages } = createMockContext(dir);
    let nextCalled = false;
    const next = async () => { nextCalled = true; };

    await middleware(context, next);

    assert(nextCalled, "next() should be called when validation passes");
    assert(context.decision === undefined, "decision should remain undefined when validation passes");

    cleanup();
    pendingTests--;
    if (pendingTests === 0) printSummary();
  });
}

// Test 2: validation errors can pause dispatch
console.log("\n=== validation errors can pause dispatch ===");
{
  pendingTests++;
  const { dir, cleanup } = createTestDir();

  import("../middleware/validation.js").then(async ({ createValidationMiddleware }) => {
    const middleware = createValidationMiddleware();
    const state: GSDState = {
      activeMilestone: null, // No active milestone
      activeSlice: null,
      activeTask: null,
      phase: "executing",
      recentDecisions: [],
      blockers: [],
      nextAction: "test",
      registry: [],
      extensions: {},
    };
    const { context, notifyMessages } = createMockContext(dir, state);
    let nextCalled = false;
    const next = async () => { nextCalled = true; };

    await middleware(context, next);

    assert(!nextCalled, "next() should NOT be called when validation fails with default onValidationError");
    assertNotUndefined(context.decision, "decision should be set when pausing");
    assertEq(context.decision?.unitType, "pause", "decision.unitType should be 'pause'");
    assertEq(context.decision?.unitId, "validation-error", "decision.unitId should be 'validation-error'");

    cleanup();
    pendingTests--;
    if (pendingTests === 0) printSummary();
  });
}

// Test 3: validation warnings allow dispatch to continue
console.log("\n=== validation warnings allow dispatch to continue ===");
{
  pendingTests++;
  const { dir, cleanup } = createTestDir();

  import("../middleware/validation.js").then(async ({ createValidationMiddleware }) => {
    const middleware = createValidationMiddleware({
      validators: [
        {
          name: "warningValidator",
          severity: "warning",
          validate: (state: GSDState) => ({ valid: false, message: "This is a warning" }),
        },
      ],
    });
    const { context, notifyMessages } = createMockContext(dir);
    let nextCalled = false;
    const next = async () => { nextCalled = true; };

    await middleware(context, next);

    assert(nextCalled, "next() should be called when only warnings occur");
    assert(context.decision === undefined, "decision should remain undefined for warnings");
    assert(notifyMessages.length > 0, "notify should be called for warnings");

    cleanup();
    pendingTests--;
    if (pendingTests === 0) printSummary();
  });
}

// Test 4: default validators check active milestone
console.log("\n=== default validators check active milestone ===");
{
  pendingTests++;
  const { dir, cleanup } = createTestDir();

  import("../middleware/validation.js").then(async ({ createValidationMiddleware }) => {
    const middleware = createValidationMiddleware();
    const state: GSDState = {
      activeMilestone: null, // No active milestone
      activeSlice: { id: "S01", title: "Test Slice" },
      activeTask: { id: "T01", title: "Test Task" },
      phase: "planning", // Not in executing phase, so slice/task validators won't fail
      recentDecisions: [],
      blockers: [],
      nextAction: "test",
      registry: [],
      extensions: {},
    };
    const { context, notifyMessages } = createMockContext(dir, state);
    let nextCalled = false;
    const next = async () => { nextCalled = true; };

    await middleware(context, next);

    assert(!nextCalled, "next() should NOT be called when active milestone is missing");
    assertNotUndefined(context.decision, "decision should be set when pausing");
    assert(notifyMessages.some(m => m.message.includes("activeMilestoneExists")), "notification should mention activeMilestoneExists");

    cleanup();
    pendingTests--;
    if (pendingTests === 0) printSummary();
  });
}

// Test 5: default validators check active slice when in slice phase
console.log("\n=== default validators check active slice when in slice phase ===");
{
  pendingTests++;
  const { dir, cleanup } = createTestDir();

  import("../middleware/validation.js").then(async ({ createValidationMiddleware }) => {
    const middleware = createValidationMiddleware();
    const state: GSDState = {
      activeMilestone: { id: "M001", title: "Test Milestone" },
      activeSlice: null, // No active slice
      activeTask: { id: "T01", title: "Test Task" },
      phase: "executing", // In executing phase
      recentDecisions: [],
      blockers: [],
      nextAction: "test",
      registry: [],
      extensions: {},
    };
    const { context, notifyMessages } = createMockContext(dir, state);
    let nextCalled = false;
    const next = async () => { nextCalled = true; };

    await middleware(context, next);

    assert(!nextCalled, "next() should NOT be called when active slice is missing in executing phase");
    assertNotUndefined(context.decision, "decision should be set when pausing");

    cleanup();
    pendingTests--;
    if (pendingTests === 0) printSummary();
  });
}

// Test 6: default validators check active task when in task phase
console.log("\n=== default validators check active task when in task phase ===");
{
  pendingTests++;
  const { dir, cleanup } = createTestDir();

  import("../middleware/validation.js").then(async ({ createValidationMiddleware }) => {
    const middleware = createValidationMiddleware();
    const state: GSDState = {
      activeMilestone: { id: "M001", title: "Test Milestone" },
      activeSlice: { id: "S01", title: "Test Slice" },
      activeTask: null, // No active task
      phase: "executing", // In executing phase
      recentDecisions: [],
      blockers: [],
      nextAction: "test",
      registry: [],
      extensions: {},
    };
    const { context, notifyMessages } = createMockContext(dir, state);
    let nextCalled = false;
    const next = async () => { nextCalled = true; };

    await middleware(context, next);

    assert(!nextCalled, "next() should NOT be called when active task is missing in executing phase");
    assertNotUndefined(context.decision, "decision should be set when pausing");

    cleanup();
    pendingTests--;
    if (pendingTests === 0) printSummary();
  });
}

// Test 7: custom validators can be added
console.log("\n=== custom validators can be added ===");
{
  pendingTests++;
  const { dir, cleanup } = createTestDir();

  import("../middleware/validation.js").then(async ({ createValidationMiddleware }) => {
    let customValidatorCalled = false;
    const middleware = createValidationMiddleware({
      validators: [
        {
          name: "customValidator",
          validate: (state: GSDState) => {
            customValidatorCalled = true;
            return { valid: false, message: "Custom validation failed" };
          },
        },
      ],
    });
    const { context, notifyMessages } = createMockContext(dir);
    let nextCalled = false;
    const next = async () => { nextCalled = true; };

    await middleware(context, next);

    assert(customValidatorCalled, "custom validator should be called");
    assert(!nextCalled, "next() should NOT be called when custom validator fails");

    cleanup();
    pendingTests--;
    if (pendingTests === 0) printSummary();
  });
}

// Test 8: validation results are stored in decision metadata
console.log("\n=== validation results are stored in decision metadata ===");
{
  pendingTests++;
  const { dir, cleanup } = createTestDir();

  import("../middleware/validation.js").then(async ({ createValidationMiddleware }) => {
    const middleware = createValidationMiddleware();
    const state: GSDState = {
      activeMilestone: null,
      activeSlice: null,
      activeTask: null,
      phase: "executing",
      recentDecisions: [],
      blockers: [],
      nextAction: "test",
      registry: [],
      extensions: {},
    };
    const { context, notifyMessages } = createMockContext(dir, state);
    let nextCalled = false;
    const next = async () => { nextCalled = true; };

    await middleware(context, next);

    assertNotUndefined(context.decision?.metadata, "metadata should be present");
    assertNotUndefined(context.decision?.metadata?.validationResults, "validationResults should be in metadata");
    assertNotUndefined(context.decision?.metadata?.validatorsRun, "validatorsRun should be in metadata");
    assertNotUndefined(context.decision?.metadata?.timestamp, "timestamp should be in metadata");

    const validationResults = context.decision?.metadata?.validationResults as any;
    assertGt(validationResults.errors, 0, "errors count should be greater than 0");

    cleanup();
    pendingTests--;
    if (pendingTests === 0) printSummary();
  });
}

// Test 9: validation middleware handles errors gracefully
console.log("\n=== validation middleware handles errors gracefully ===");
{
  pendingTests++;
  const { dir, cleanup } = createTestDir();

  import("../middleware/validation.js").then(async ({ createValidationMiddleware }) => {
    const middleware = createValidationMiddleware({
      validators: [
        {
          name: "throwingValidator",
          validate: (state: GSDState) => {
            throw new Error("Validator threw an error");
          },
        },
      ],
    });
    const { context, notifyMessages } = createMockContext(dir);
    let nextCalled = false;
    const next = async () => { nextCalled = true; };

    try {
      await middleware(context, next);
    } catch {
      // Should not throw, should handle gracefully
    }

    // The middleware should handle the error and pause dispatch
    assert(!nextCalled, "next() should NOT be called when validator throws");
    assertNotUndefined(context.decision, "decision should be set when validator throws");
    assert(notifyMessages.some(m => m.message.includes("throwingValidator")), "notification should mention throwingValidator");

    cleanup();
    pendingTests--;
    if (pendingTests === 0) printSummary();
  });
}

// Test 10: onValidationError throw option throws error
console.log("\n=== onValidationError throw option throws error ===");
{
  pendingTests++;
  const { dir, cleanup } = createTestDir();

  import("../middleware/validation.js").then(async ({ createValidationMiddleware }) => {
    const middleware = createValidationMiddleware({
      validators: [
        {
          name: "failingValidator",
          validate: (state: GSDState) => ({ valid: false, message: "This validator fails" }),
        },
      ],
      onValidationError: "throw",
    });
    const { context, notifyMessages } = createMockContext(dir);
    let nextCalled = false;
    const next = async () => { nextCalled = true; };

    let errorThrown = false;
    try {
      await middleware(context, next);
    } catch (error) {
      errorThrown = true;
      assert(error instanceof Error, "should throw an Error");
      assert((error as Error).message.includes("Validation failed"), "error message should mention validation failed");
      assert((error as Error).message.includes("failingValidator"), "error message should mention failingValidator");
    }

    assert(errorThrown, "middleware should throw when onValidationError is 'throw'");
    assert(!nextCalled, "next() should NOT be called when error is thrown");

    cleanup();
    pendingTests--;
    if (pendingTests === 0) printSummary();
  });
}

// ─── Summary ────────────────────────────────────────────────────────────────

function printSummary(): void {
  console.log("\n" + "=".repeat(70));
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(70));

  if (failed > 0) {
    process.exit(1);
  }
}
