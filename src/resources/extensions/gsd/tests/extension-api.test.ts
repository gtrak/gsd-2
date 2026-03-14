// GSD Extension — Extension API Export Tests
// Tests that all public APIs are properly exported for extension authors

import {
  registerDispatchMiddleware,
  getRegisteredDispatchMiddlewares,
  clearRegisteredDispatchMiddlewares,
  composeDispatchMiddlewares,
  composeDispatchMiddlewaresWithPreferences,
  composeDispatchMiddlewaresWithConfig,
} from "../middleware/index.js";
import type {
  DispatchContext,
  DispatchDecision,
  DispatchMiddleware,
  MiddlewareConfig,
  MiddlewareFactory,
  DispatchMiddlewareRegistration,
  GSDMiddleware,
} from "../middleware/index.js";
import type { HookContext } from "../hooks.js";
import {
  registerHook,
  getRegisteredHooks,
  clearRegisteredHooks,
  type HookRegistration,
} from "../hooks.js";

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
  assertTypeIsFunction(composeDispatchMiddlewaresWithConfig, "composeDispatchMiddlewaresWithConfig should be a function");
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
    return config.priority !== undefined;
  }
  function acceptsMiddlewareFactory(factory: MiddlewareFactory): boolean {
    return typeof factory === "function";
  }
  function acceptsDispatchMiddlewareRegistration(reg: DispatchMiddlewareRegistration): boolean {
    return reg.name !== undefined;
  }
  function acceptsGSDMiddleware(mw: GSDMiddleware): boolean {
    return typeof mw === "function";
  }

  // Test that the functions accept the types
  assert(typeof acceptsDispatchContext === "function", "DispatchContext type should be accessible");
  assert(typeof acceptsDispatchDecision === "function", "DispatchDecision type should be accessible");
  assert(typeof acceptsDispatchMiddleware === "function", "DispatchMiddleware type should be accessible");
  assert(typeof acceptsMiddlewareConfig === "function", "MiddlewareConfig type should be accessible");
  assert(typeof acceptsMiddlewareFactory === "function", "MiddlewareFactory type should be accessible");
  assert(typeof acceptsDispatchMiddlewareRegistration === "function", "DispatchMiddlewareRegistration type should be accessible");
  assert(typeof acceptsGSDMiddleware === "function", "GSDMiddleware type should be accessible");
}

// Test 3: extension author can import and use registerDispatchMiddleware
console.log("\n=== Test 3: extension author can import and use registerDispatchMiddleware ===");
{
  clearRegisteredDispatchMiddlewares();

  // Simulate extension author registering a middleware
  registerDispatchMiddleware({
    name: "extension-test-middleware",
    priority: 85,
    enabled: true,
    middleware: async (ctx: DispatchContext, next) => {
      // Extension author's custom logic
      await next();
    },
  });

  const registered = getRegisteredDispatchMiddlewares();
  assertEq(registered.length, 1, "should have 1 registered middleware");
  assertEq(registered[0].name, "extension-test-middleware", "middleware name should match");
  assertEq(registered[0].priority, 85, "middleware priority should match");
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
    priority: 90,
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

// Test 5: extension author can access HookContext type
console.log("\n=== Test 5: extension author can access HookContext type ===");
{
  // HookContext type should be accessible for extension authors
  // Verify by using the type in a function signature
  function acceptsHookContext(ctx: HookContext): boolean {
    return ctx.basePath !== undefined;
  }

  assert(typeof acceptsHookContext === "function", "HookContext type should be accessible");

  // Verify HookContext has expected properties by using it
  const mockHookContext: HookContext = {
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
  };

  assertNotNull(mockHookContext.basePath, "HookContext should have basePath");
  assertNotNull(mockHookContext.state, "HookContext should have state");
  assertNotNull(mockHookContext.workingState, "HookContext should have workingState");
}

// Test 6: registerHook is still available for backward compatibility
console.log("\n=== Test 6: registerHook is still available for backward compatibility ===");
{
  clearRegisteredHooks();

  // registerHook should still be available
  assertTypeIsFunction(registerHook, "registerHook should be a function");
  assertTypeIsFunction(getRegisteredHooks, "getRegisteredHooks should be a function");
  assertTypeIsFunction(clearRegisteredHooks, "clearRegisteredHooks should be a function");

  // Test that registerHook still works
  registerHook({
    name: "backward-compat-hook",
    middleware: async (ctx, next) => {
      await next();
    },
    priority: 50,
  });

  const hooks = getRegisteredHooks();
  assertEq(hooks.length, 1, "should have 1 registered hook");
  assertEq(hooks[0].name, "backward-compat-hook", "hook name should match");
}

// Test 7: compose functions are exported
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

  // Test composeDispatchMiddlewaresWithConfig
  const config: any = {};
  const middlewaresWithConfig = composeDispatchMiddlewaresWithConfig(config);
  assert(Array.isArray(middlewaresWithConfig), "composeDispatchMiddlewaresWithConfig should return an array");
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
    const priority = config?.priority ?? 50;
    const middleware: DispatchMiddleware = async (ctx, next) => {
      await next();
    };
    (middleware as DispatchMiddleware & { __metadata?: { name: string; priority: number } }).__metadata = {
      name: "test-factory-middleware",
      priority,
    };
    return middleware;
  };

  const middleware = createTestMiddleware({ priority: 75 });
  assertNotNull(middleware, "factory should return a middleware");
  const metadata = (middleware as DispatchMiddleware & { __metadata?: { priority: number } }).__metadata;
  assertEq(metadata?.priority, 75, "factory should respect config");
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
    priority: 85,
    enabled: true,
    middleware: myMiddleware,
  };

  registerDispatchMiddleware(registration);

  const registered = getRegisteredDispatchMiddlewares();
  assertEq(registered.length, 1, "should have 1 registered middleware");
  assertEq(registered[0].name, "complete-extension-middleware", "middleware should be registered");
}

// Test 10: GSDMiddleware type can be used with registerDispatchMiddleware
console.log("\n=== Test 10: GSDMiddleware type can be used with registerDispatchMiddleware ===");
{
  clearRegisteredDispatchMiddlewares();

  // Extension author creates a GSDMiddleware (uses HookContext)
  const gsdMiddleware: GSDMiddleware = async (ctx, next) => {
    await next();
  };

  registerDispatchMiddleware({
    name: "gsd-middleware-extension",
    priority: 65,
    enabled: true,
    middleware: gsdMiddleware,
  });

  const registered = getRegisteredDispatchMiddlewares();
  assertEq(registered.length, 1, "should have 1 registered middleware");
  assertEq(registered[0].middleware, gsdMiddleware, "GSDMiddleware should be registered");
}

// ─── Summary ────────────────────────────────────────────────────────────────

console.log("\n" + "=".repeat(70));
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log("=".repeat(70));

if (failed > 0) {
  process.exit(1);
}
