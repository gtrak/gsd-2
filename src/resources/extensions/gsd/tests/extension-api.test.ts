// GSD Extension — Extension API Export Tests
// Tests that all public APIs are properly exported for extension authors

import {
  registerDispatchMiddleware,
  getRegisteredDispatchMiddlewares,
  clearRegisteredDispatchMiddlewares,
  composeDispatchMiddlewares,
  composeDispatchMiddlewaresWithPreferences,
} from "../middleware/index.js";
import type {
  DispatchContext,
  DispatchDecision,
  DispatchMiddleware,
  MiddlewareConfig,
  MiddlewareFactory,
  DispatchMiddlewareRegistration,
  PipelineStage,
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

function assertTypeIsFunction(value: unknown, message: string): void {
  if (typeof value === "function") {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${message} — expected function, got ${typeof value}`);
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

// ─── Tests ──────────────────────────────────────────────────────────────────

console.log("\n=== Extension API Export Tests ===\n");

// Test 1: all middleware registration functions are exported
console.log("=== Test 1: all middleware registration functions are exported ===");
{
  assertTypeIsFunction(registerDispatchMiddleware, "registerDispatchMiddleware should be a function");
  assertTypeIsFunction(getRegisteredDispatchMiddlewares, "getRegisteredDispatchMiddlewares should be a function");
  assertTypeIsFunction(clearRegisteredDispatchMiddlewares, "clearRegisteredDispatchMiddlewares should be a function");
  assertTypeIsFunction(composeDispatchMiddlewares, "composeDispatchMiddlewares should be a function");
  assertTypeIsFunction(composeDispatchMiddlewaresWithPreferences, "composeDispatchMiddlewaresWithPreferences should be a function");
}

// Test 2: all middleware types are exported
console.log("\n=== Test 2: all middleware types are exported ===");
{
  // Type exports are checked at compile time - if this file compiles, the types are accessible
  // We verify by using the types in function signatures and type assertions
  function acceptsDispatchContext(ctx: DispatchContext): boolean {
    return ctx.basePath !== undefined;
  }
  function acceptsDispatchDecision(decision: DispatchDecision): boolean {
    return decision.unitType !== undefined;
  }
  function acceptsDispatchMiddleware(mw: DispatchMiddleware): boolean {
    return typeof mw === "function";
  }
  function acceptsMiddlewareConfig(config: MiddlewareConfig): boolean {
    return config.stage !== undefined;
  }
  function acceptsMiddlewareFactory(factory: MiddlewareFactory): boolean {
    return typeof factory === "function";
  }
  function acceptsDispatchMiddlewareRegistration(reg: DispatchMiddlewareRegistration): boolean {
    return reg.name !== undefined;
  }

  // Test that the functions accept the types
  assert(typeof acceptsDispatchContext === "function", "DispatchContext type should be accessible");
  assert(typeof acceptsDispatchDecision === "function", "DispatchDecision type should be accessible");
  assert(typeof acceptsDispatchMiddleware === "function", "DispatchMiddleware type should be accessible");
  assert(typeof acceptsMiddlewareConfig === "function", "MiddlewareConfig type should be accessible");
  assert(typeof acceptsMiddlewareFactory === "function", "MiddlewareFactory type should be accessible");
  assert(typeof acceptsDispatchMiddlewareRegistration === "function", "DispatchMiddlewareRegistration type should be accessible");
}

// Test 3: extension author can import and use registerDispatchMiddleware
console.log("\n=== Test 3: extension author can import and use registerDispatchMiddleware ===");
{
  clearRegisteredDispatchMiddlewares();

  // Simulate extension author registering a middleware
  registerDispatchMiddleware({
    name: "extension-test-middleware",
    stage: "dispatch",
    enabled: true,
    middleware: async (ctx: DispatchContext, next) => {
      // Extension author's custom logic
      await next();
    },
  });

  const registered = getRegisteredDispatchMiddlewares();
  assertEq(registered.length, 1, "should have 1 registered middleware");
  assertEq(registered[0].name, "extension-test-middleware", "middleware name should match");
  assertEq(registered[0].stage, "dispatch", "middleware stage should match");
  assertEq(registered[0].enabled, true, "middleware should be enabled");
}

// Test 4: extension author can create custom DispatchMiddleware
console.log("\n=== Test 4: extension author can create custom DispatchMiddleware ===");
{
  clearRegisteredDispatchMiddlewares();

  // Extension author creates a middleware that modifies the decision
  let middlewareWasCalled = false;
  let nextWasCalled = false;

  const customMiddleware: DispatchMiddleware = async (ctx: DispatchContext, next) => {
    middlewareWasCalled = true;
    await next();
    nextWasCalled = true;
  };

  registerDispatchMiddleware({
    name: "custom-decision-middleware",
    stage: "pre-dispatch",
    enabled: true,
    middleware: customMiddleware,
  });

  const registered = getRegisteredDispatchMiddlewares();
  assertEq(registered.length, 1, "should have 1 registered middleware");
  assertNotNull(registered[0].middleware, "middleware function should be present");

  // Verify the middleware is callable
  const mockContext = createMockDispatchContext();
  await registered[0].middleware(mockContext, async () => {
    nextWasCalled = true;
  });

  assert(middlewareWasCalled, "middleware should have been called");
  assert(nextWasCalled, "next function should have been called");
}

// Test 5: compose functions are exported
console.log("\n=== Test 7: compose functions are exported ===");
{
  // Test composeDispatchMiddlewares
  const middlewares = composeDispatchMiddlewares();
  assert(Array.isArray(middlewares), "composeDispatchMiddlewares should return an array");
  assert(middlewares.length > 0, "composeDispatchMiddlewares should return middlewares");

  // Test composeDispatchMiddlewaresWithPreferences
  const prefs: any = {};
  const middlewaresWithPrefs = composeDispatchMiddlewaresWithPreferences(prefs);
  assert(Array.isArray(middlewaresWithPrefs), "composeDispatchMiddlewaresWithPreferences should return an array");
}

// Test 8: middleware factory types are accessible
console.log("\n=== Test 8: middleware factory types are accessible ===");
{
  // MiddlewareFactory type should be accessible
  // Verify by using the type in a function signature
  function acceptsMiddlewareFactory(factory: MiddlewareFactory): boolean {
    return typeof factory === "function";
  }

  assert(typeof acceptsMiddlewareFactory === "function", "MiddlewareFactory type should be accessible");

  // Create a simple middleware factory
  const createTestMiddleware: MiddlewareFactory = (config?: Partial<MiddlewareConfig>) => {
    const stage = config?.stage ?? "dispatch";
    const middleware: DispatchMiddleware = async (ctx, next) => {
      await next();
    };
    (middleware as DispatchMiddleware & { __metadata?: { name: string; stage: string } }).__metadata = {
      name: "test-factory-middleware",
      stage,
    };
    return middleware;
  };

  const middleware = createTestMiddleware({ stage: "notification" });
  assertNotNull(middleware, "factory should return a middleware");
  const metadata = (middleware as DispatchMiddleware & { __metadata?: { stage: string } }).__metadata;
  assertEq(metadata?.stage, "notification", "factory should respect config");
}

// Test 9: extension author can use all types together
console.log("\n=== Test 9: extension author can use all types together ===");
{
  clearRegisteredDispatchMiddlewares();

  // Simulate a complete extension author workflow
  const myMiddleware: DispatchMiddleware = async (ctx: DispatchContext, next) => {
    // Before logic
    const isCompleted = ctx.isUnitCompleted("execute-task", "M001/S01/T01");
    await next();
    // After logic
  };

  const registration: DispatchMiddlewareRegistration = {
    name: "complete-extension-middleware",
    stage: "dispatch",
    enabled: true,
    middleware: myMiddleware,
  };

  registerDispatchMiddleware(registration);

  const registered = getRegisteredDispatchMiddlewares();
  assertEq(registered.length, 1, "should have 1 registered middleware");
  assertEq(registered[0].name, "complete-extension-middleware", "middleware should be registered");
}

// Test 10: PipelineStage type is exported
console.log("\n=== Test 11: PipelineStage type is exported ===");
{
  // Type-only verification - PipelineStage should be importable
  const testStage: PipelineStage = "dispatch";
  console.log(`✓ PipelineStage type works: ${testStage}`);
  assert(testStage === "dispatch", "PipelineStage type should accept valid stage values");
}

// ─── Summary ────────────────────────────────────────────────────────────────

console.log("\n" + "=".repeat(70));
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log("=".repeat(70));

if (failed > 0) {
  process.exit(1);
}
