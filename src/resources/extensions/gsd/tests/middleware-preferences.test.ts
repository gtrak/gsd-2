// GSD Extension — Middleware Preferences Tests
// Tests for loading middleware configuration from preferences

import {
  loadMiddlewareConfig,
  type MiddlewarePreferences,
  type GSDPreferences,
} from "../preferences.js";
import {
  composeDispatchMiddlewaresWithPreferences,
  clearRegisteredDispatchMiddlewares,
} from "../middleware/index.js";

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

// Test 2: loadMiddlewareConfig parses enabled middlewares with priorities
console.log("\n=== Test 2: loadMiddlewareConfig parses enabled middlewares with priorities ===");
{
  const prefs: GSDPreferences = {
    middleware: {
      enabled: [
        { name: "idempotency", priority: 100 },
        { name: "budget-ceiling", priority: 95 },
        { name: "code-review", priority: 70 },
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
      assertEq(idempotency.priority, 100, "idempotency priority should be 100");
    }

    const budgetCeiling = config.enabled.find(m => m.name === "budget-ceiling");
    assertNotNull(budgetCeiling, "budget-ceiling should be found");
    if (budgetCeiling) {
      assertEq(budgetCeiling.priority, 95, "budget-ceiling priority should be 95");
    }

    const codeReview = config.enabled.find(m => m.name === "code-review");
    assertNotNull(codeReview, "code-review should be found");
    if (codeReview) {
      assertEq(codeReview.priority, 70, "code-review priority should be 70");
    }
  }
}

// Test 3: loadMiddlewareConfig applies default priority when not specified
console.log("\n=== Test 3: loadMiddlewareConfig applies default priority when not specified ===");
{
  const prefs: GSDPreferences = {
    middleware: {
      enabled: [
        { name: "idempotency" },
        { name: "merge-guard", priority: 90 },
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
      assertEq(idempotency.priority, 50, "idempotency should have default priority 50");
    }

    const mergeGuard = config.enabled.find(m => m.name === "merge-guard");
    assertNotNull(mergeGuard, "merge-guard should be found");
    if (mergeGuard) {
      assertEq(mergeGuard.priority, 90, "merge-guard should have specified priority 90");
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

// Test 5: loadMiddlewareConfig filters invalid priorities
console.log("\n=== Test 5: loadMiddlewareConfig filters invalid priorities ===");
{
  const prefs: GSDPreferences = {
    middleware: {
      enabled: [
        { name: "idempotency", priority: 100 },
        { name: "budget-ceiling", priority: 150 }, // Invalid - too high
        { name: "merge-guard", priority: -10 },    // Invalid - negative
        { name: "code-review", priority: 70 },
      ],
    },
  };
  const config = loadMiddlewareConfig(prefs);

  assertNotNull(config.enabled, "enabled should be defined");
  if (config.enabled) {
    assertArrayLength(config.enabled, 2, "should have 2 enabled middlewares (2 filtered out)");

    const budgetCeiling = config.enabled.find(m => m.name === "budget-ceiling");
    assert(budgetCeiling === undefined, "budget-ceiling with priority 150 should be filtered out");

    const mergeGuard = config.enabled.find(m => m.name === "merge-guard");
    assert(mergeGuard === undefined, "merge-guard with priority -10 should be filtered out");

    const idempotency = config.enabled.find(m => m.name === "idempotency");
    assertNotNull(idempotency, "idempotency should be present");

    const codeReview = config.enabled.find(m => m.name === "code-review");
    assertNotNull(codeReview, "code-review should be present");
  }
}

// Test 6: composeDispatchMiddlewaresWithPreferences respects enabled list
console.log("\n=== Test 6: composeDispatchMiddlewaresWithPreferences respects enabled list ===");
{
  clearRegisteredDispatchMiddlewares();

  const prefs: GSDPreferences = {
    middleware: {
      enabled: [
        { name: "idempotency", priority: 100 },
        { name: "budget-ceiling", priority: 95 },
      ],
    },
  };
  const middlewares = composeDispatchMiddlewaresWithPreferences(prefs);

  // Should only have the 2 enabled middlewares
  assertArrayLength(middlewares, 2, "should have 2 middlewares (only enabled ones)");

  const names = middlewares.map(m => (m as any).__metadata?.name);
  assert(names.includes("idempotency"), "idempotency should be in the list");
  assert(names.includes("budget-ceiling"), "budget-ceiling should be in the list");
  assert(!names.includes("merge-guard"), "merge-guard should NOT be in the list");
  assert(!names.includes("uat-dispatch"), "uat-dispatch should NOT be in the list");
}

// Test 7: composeDispatchMiddlewaresWithPreferences filters disabled middlewares
console.log("\n=== Test 7: composeDispatchMiddlewaresWithPreferences filters disabled middlewares ===");
{
  clearRegisteredDispatchMiddlewares();

  const prefs: GSDPreferences = {
    middleware: {
      disabled: ["uat-dispatch", "merge-guard"],
    },
  };
  const middlewares = composeDispatchMiddlewaresWithPreferences(prefs);

  const names = middlewares.map(m => (m as any).__metadata?.name);
  assert(!names.includes("uat-dispatch"), "uat-dispatch should NOT be in the list");
  assert(!names.includes("merge-guard"), "merge-guard should NOT be in the list");

  // Other middlewares should still be present
  assert(names.includes("idempotency"), "idempotency should be in the list");
  assert(names.includes("budget-ceiling"), "budget-ceiling should be in the list");
  assert(names.includes("code-review"), "code-review should be in the list");
}

// Test 8: composeDispatchMiddlewaresWithPreferences overrides priorities
console.log("\n=== Test 8: composeDispatchMiddlewaresWithPreferences overrides priorities ===");
{
  clearRegisteredDispatchMiddlewares();

  const prefs: GSDPreferences = {
    middleware: {
      enabled: [
        { name: "idempotency", priority: 100 },
        { name: "budget-ceiling", priority: 95 },
        { name: "code-review", priority: 85 }, // Override default 70
      ],
    },
  };
  const middlewares = composeDispatchMiddlewaresWithPreferences(prefs);

  const idempotency = middlewares.find(m => (m as any).__metadata?.name === "idempotency");
  assertNotNull(idempotency, "idempotency should be found");
  if (idempotency) {
    assertEq((idempotency as any).__metadata?.priority, 100, "idempotency priority should be 100");
  }

  const budgetCeiling = middlewares.find(m => (m as any).__metadata?.name === "budget-ceiling");
  assertNotNull(budgetCeiling, "budget-ceiling should be found");
  if (budgetCeiling) {
    assertEq((budgetCeiling as any).__metadata?.priority, 95, "budget-ceiling priority should be 95");
  }

  const codeReview = middlewares.find(m => (m as any).__metadata?.name === "code-review");
  assertNotNull(codeReview, "code-review should be found");
  if (codeReview) {
    assertEq((codeReview as any).__metadata?.priority, 85, "code-review priority should be overridden to 85");
  }
}

// Test 9: composeDispatchMiddlewaresWithPreferences uses defaults when no config
console.log("\n=== Test 9: composeDispatchMiddlewaresWithPreferences uses defaults when no config ===");
{
  clearRegisteredDispatchMiddlewares();

  const prefs: GSDPreferences = {};
  const middlewares = composeDispatchMiddlewaresWithPreferences(prefs);

  // Should have all 11 default middlewares
  assertArrayLength(middlewares, 11, "should have 11 default middlewares");

  // Verify expected priorities
  const priorities = middlewares.map(m => (m as any).__metadata?.priority);
  assertEq(priorities[0], 100, "first middleware should have priority 100 (idempotency)");
  assertEq(priorities[1], 98, "second middleware should have priority 98 (validation)");
  assertEq(priorities[2], 95, "third middleware should have priority 95 (budget-ceiling)");
  assertEq(priorities[3], 90, "fourth middleware should have priority 90 (merge-guard)");
  assertEq(priorities[4], 85, "fifth middleware should have priority 85 (uat-dispatch)");
  assertEq(priorities[5], 80, "sixth middleware should have priority 80 (reassessment)");
  assertEq(priorities[6], 75, "seventh middleware should have priority 75 (phase-dispatch)");
  assertEq(priorities[7], 70, "eighth middleware should have priority 70 (code-review)");
  assertEq(priorities[8], 65, "ninth middleware should have priority 65 (metrics)");
  assertEq(priorities[9], 60, "tenth middleware should have priority 60 (observability)");
  assertEq(priorities[10], 55, "eleventh middleware should have priority 55 (notifications)");
}

// Test 10: composeDispatchMiddlewaresWithPreferences merges global and project prefs
console.log("\n=== Test 10: composeDispatchMiddlewaresWithPreferences merges global and project prefs ===");
{
  clearRegisteredDispatchMiddlewares();

  // Simulate merged preferences (as would come from loadEffectiveGSDPreferences)
  const mergedPrefs: GSDPreferences = {
    middleware: {
      enabled: [
        { name: "idempotency", priority: 100 },
        { name: "budget-ceiling", priority: 95 },
        { name: "code-review", priority: 70 },
      ],
      disabled: ["uat-dispatch"],
    },
  };
  const middlewares = composeDispatchMiddlewaresWithPreferences(mergedPrefs);

  const names = middlewares.map(m => (m as any).__metadata?.name);

  // Enabled middlewares should be present
  assert(names.includes("idempotency"), "idempotency should be in the list");
  assert(names.includes("budget-ceiling"), "budget-ceiling should be in the list");
  assert(names.includes("code-review"), "code-review should be in the list");

  // Disabled middlewares should NOT be present
  assert(!names.includes("uat-dispatch"), "uat-dispatch should NOT be in the list");

  // Verify priorities are correct
  const idempotency = middlewares.find(m => (m as any).__metadata?.name === "idempotency");
  if (idempotency) {
    assertEq((idempotency as any).__metadata?.priority, 100, "idempotency priority should be 100");
  }

  const codeReview = middlewares.find(m => (m as any).__metadata?.name === "code-review");
  if (codeReview) {
    assertEq((codeReview as any).__metadata?.priority, 70, "code-review priority should be 70");
  }
}

// ─── Summary ────────────────────────────────────────────────────────────────

console.log("\n" + "=".repeat(70));
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log("=".repeat(70));

if (failed > 0) {
  process.exit(1);
}
