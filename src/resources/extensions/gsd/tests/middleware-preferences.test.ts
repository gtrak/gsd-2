// GSD Extension — Middleware Preferences Tests
// Tests for loading middleware configuration from preferences

import {
  loadMiddlewareConfig,
  type MiddlewarePreferences,
  type GSDPreferences,
} from "../preferences.js";
import {
  composeDispatchMiddlewares,
  clearRegisteredDispatchMiddlewares,
} from "../middleware/index.js";
import type { PipelineStage } from "../middleware/types.js";

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

function assertNotNull<T>(actual: T, message: string): void {
  if (actual !== null && actual !== undefined) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${message} — expected not null/undefined`);
  }
}

function assertArrayLength(actual: unknown[], expected: number, message: string): void {
  if (actual.length === expected) {
    passed++;
  } else {
    failed++;
    console.error(
      `  FAIL: ${message} — expected length ${expected}, got ${actual.length}`,
    );
  }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

console.log("\n=== Middleware Preferences Tests ===\n");

// Test 1: loadMiddlewareConfig returns empty config when no preferences set
console.log("=== Test 1: loadMiddlewareConfig returns empty config when no preferences set ===");
{
  const prefs: GSDPreferences = {};
  const config = loadMiddlewareConfig(prefs);

  assert(config !== undefined, "config should be defined");
  assert(config.enabled === undefined || config.enabled.length === 0, "enabled should be empty");
  assert(config.disabled === undefined || config.disabled.length === 0, "disabled should be empty");
}

// Test 2: loadMiddlewareConfig parses enabled middlewares with stages
console.log("\n=== Test 2: loadMiddlewareConfig parses enabled middlewares with stages ===");
{
  const prefs: GSDPreferences = {
    middleware: {
      enabled: [
        { name: "idempotency", stage: "pre-validation" as PipelineStage },
        { name: "budget-ceiling", stage: "pre-dispatch" as PipelineStage },
        { name: "code-review", stage: "post-dispatch" as PipelineStage },
      ],
    },
  };
  const config = loadMiddlewareConfig(prefs);

  assertNotNull(config.enabled, "enabled should be defined");
  if (config.enabled) {
    assertArrayLength(config.enabled, 3, "should have 3 enabled middlewares");

    const idempotency = config.enabled.find(m => m.name === "idempotency");
    assertNotNull(idempotency, "idempotency should be found");
    if (idempotency) {
      assertEq(idempotency.stage, "pre-validation" as PipelineStage, "idempotency should have stage pre-validation");
    }

    const budgetCeiling = config.enabled.find(m => m.name === "budget-ceiling");
    assertNotNull(budgetCeiling, "budget-ceiling should be found");
    if (budgetCeiling) {
      assertEq(budgetCeiling.stage, "pre-dispatch" as PipelineStage, "budget-ceiling should have stage pre-dispatch");
    }

    const codeReview = config.enabled.find(m => m.name === "code-review");
    assertNotNull(codeReview, "code-review should be found");
    if (codeReview) {
      assertEq(codeReview.stage, "post-dispatch" as PipelineStage, "code-review should have stage post-dispatch");
    }
  }
}

// Test 3: loadMiddlewareConfig applies default stage when not specified
console.log("\n=== Test 3: loadMiddlewareConfig applies default stage when not specified ===");
{
  const prefs: GSDPreferences = {
    middleware: {
      enabled: [
        { name: "idempotency" },
        { name: "merge-guard", stage: "pre-dispatch" as PipelineStage },
      ],
    },
  };
  const config = loadMiddlewareConfig(prefs);

  assertNotNull(config.enabled, "enabled should be defined");
  if (config.enabled) {
    assertArrayLength(config.enabled, 2, "should have 2 enabled middlewares");

    const idempotency = config.enabled.find(m => m.name === "idempotency");
    assertNotNull(idempotency, "idempotency should be found");
    if (idempotency) {
      assertEq(idempotency.stage, "pre-validation" as PipelineStage, "idempotency should have default stage pre-validation");
    }

    const mergeGuard = config.enabled.find(m => m.name === "merge-guard");
    assertNotNull(mergeGuard, "merge-guard should be found");
    if (mergeGuard) {
      assertEq(mergeGuard.stage, "pre-dispatch" as PipelineStage, "merge-guard should have stage pre-dispatch");
    }
  }
}

// Test 4: loadMiddlewareConfig returns disabled middleware list
console.log("\n=== Test 4: loadMiddlewareConfig returns disabled middleware list ===");
{
  const prefs: GSDPreferences = {
    middleware: {
      disabled: ["uat-dispatch", "merge-guard"],
    },
  };
  const config = loadMiddlewareConfig(prefs);

  assertNotNull(config.disabled, "disabled should be defined");
  if (config.disabled) {
    assertArrayLength(config.disabled, 2, "should have 2 disabled middlewares");

    assert(config.disabled.includes("uat-dispatch"), "uat-dispatch should be in disabled list");
    assert(config.disabled.includes("merge-guard"), "merge-guard should be in disabled list");
  }
}

// Test 5: composeDispatchMiddlewares respects enabled list
console.log("\n=== Test 6: composeDispatchMiddlewares respects enabled list ===");
{
  clearRegisteredDispatchMiddlewares();

  const prefs: GSDPreferences = {
    middleware: {
      enabled: [
        { name: "idempotency", stage: "pre-validation" as PipelineStage },
        { name: "budget-ceiling", stage: "pre-dispatch" as PipelineStage },
      ],
    },
  };
  const middlewares = composeDispatchMiddlewares(prefs);

  // Should only have the 2 enabled middlewares
  assertArrayLength(middlewares, 2, "should have 2 middlewares (only enabled ones)");

  const names = middlewares.map(m => (m as any).__metadata?.name);
  assert(names.includes("idempotency"), "idempotency should be in the list");
  assert(names.includes("budget-ceiling"), "budget-ceiling should be in the list");
  assert(!names.includes("merge-guard"), "merge-guard should NOT be in the list");
  assert(!names.includes("uat-dispatch"), "uat-dispatch should NOT be in the list");
}

// Test 7: composeDispatchMiddlewares filters disabled middlewares
console.log("\n=== Test 7: composeDispatchMiddlewares filters disabled middlewares ===");
{
  clearRegisteredDispatchMiddlewares();

  const prefs: GSDPreferences = {
    middleware: {
      disabled: ["uat-dispatch", "merge-guard"],
    },
  };
  const middlewares = composeDispatchMiddlewares(prefs);

  const names = middlewares.map(m => (m as any).__metadata?.name);
  assert(!names.includes("uat-dispatch"), "uat-dispatch should NOT be in the list");
  assert(!names.includes("merge-guard"), "merge-guard should NOT be in the list");

  // Other middlewares should still be present
  assert(names.includes("idempotency"), "idempotency should be in the list");
  assert(names.includes("budget-ceiling"), "budget-ceiling should be in the list");
  assert(names.includes("code-review"), "code-review should be in the list");
}

// Test 8: composeDispatchMiddlewares uses default stages
console.log("\n=== Test 8: composeDispatchMiddlewares uses default stages ===");
{
  clearRegisteredDispatchMiddlewares();

  const prefs: GSDPreferences = {
    middleware: {
      enabled: [
        { name: "idempotency" },
        { name: "budget-ceiling" },
        { name: "code-review" },
      ],
    },
  };
  const middlewares = composeDispatchMiddlewares(prefs);

  const idempotency = middlewares.find(m => (m as any).__metadata?.name === "idempotency");
  assertNotNull(idempotency, "idempotency should be found");
  if (idempotency) {
    assertEq((idempotency as any).__metadata?.stage, "pre-validation" as PipelineStage, "idempotency should use default stage pre-validation");
  }

  const budgetCeiling = middlewares.find(m => (m as any).__metadata?.name === "budget-ceiling");
  assertNotNull(budgetCeiling, "budget-ceiling should be found");
  if (budgetCeiling) {
    assertEq((budgetCeiling as any).__metadata?.stage, "pre-dispatch" as PipelineStage, "budget-ceiling should use default stage pre-dispatch");
  }

  const codeReview = middlewares.find(m => (m as any).__metadata?.name === "code-review");
  assertNotNull(codeReview, "code-review should be found");
  if (codeReview) {
    assertEq((codeReview as any).__metadata?.stage, "dispatch" as PipelineStage, "code-review should use default stage dispatch");
  }
}

// Test 9: composeDispatchMiddlewares uses defaults when no config
console.log("\n=== Test 9: composeDispatchMiddlewares uses defaults when no config ===");
{
  clearRegisteredDispatchMiddlewares();

  const prefs: GSDPreferences = {};
  const middlewares = composeDispatchMiddlewares(prefs);

  // Should have all 11 default middlewares
  assertArrayLength(middlewares, 11, "should have 11 default middlewares");

  // Verify expected stages
  const stages = middlewares.map(m => (m as any).__metadata?.stage);
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

// Test 10: composeDispatchMiddlewares merges global and project prefs
console.log("\n=== Test 10: composeDispatchMiddlewares merges global and project prefs ===");
{
  clearRegisteredDispatchMiddlewares();

  // Simulate merged preferences (as would come from loadEffectiveGSDPreferences)
  const mergedPrefs: GSDPreferences = {
    middleware: {
      enabled: [
        { name: "idempotency", stage: "pre-validation" as PipelineStage },
        { name: "budget-ceiling", stage: "pre-dispatch" as PipelineStage },
        { name: "code-review", stage: "dispatch" as PipelineStage },
      ],
      disabled: ["uat-dispatch"],
    },
  };
  const middlewares = composeDispatchMiddlewares(mergedPrefs);

  const names = middlewares.map(m => (m as any).__metadata?.name);

  // Enabled middlewares should be present
  assert(names.includes("idempotency"), "idempotency should be in the list");
  assert(names.includes("budget-ceiling"), "budget-ceiling should be in the list");
  assert(names.includes("code-review"), "code-review should be in the list");

  // Disabled middlewares should NOT be present
  assert(!names.includes("uat-dispatch"), "uat-dispatch should NOT be in the list");

  // Verify stages are correct
  const idempotency = middlewares.find(m => (m as any).__metadata?.name === "idempotency");
  if (idempotency) {
    assertEq((idempotency as any).__metadata?.stage, "pre-validation" as PipelineStage, "idempotency stage should be pre-validation");
  }

  const codeReview = middlewares.find(m => (m as any).__metadata?.name === "code-review");
  if (codeReview) {
    assertEq((codeReview as any).__metadata?.stage, "dispatch" as PipelineStage, "code-review stage should be dispatch");
  }
}

// ─── Summary ────────────────────────────────────────────────────────────────

console.log("\n" + "=".repeat(70));
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log("=".repeat(70));

if (failed > 0) {
  process.exit(1);
}
