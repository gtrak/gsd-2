// GSD Extension — Hook System Tests
// Unit tests for registerHook, getRegisteredHooks, executeMiddlewareChain

import {
  registerHook,
  getRegisteredHooks,
  clearRegisteredHooks,
  executeMiddlewareChain,
  type HookRegistration,
  type HookContext,
} from "../hooks.js";
import type { GSDState } from "../types.js";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) passed++;
  else {
    failed++;
    console.error(`  FAIL: ${message}`);
  }
}

function assertEq<T>(actual: T, expected: T, message: string): void {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed++;
  else {
    failed++;
    console.error(`  FAIL: ${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// Mock ExtensionAPI and ExtensionContext
const mockPi = {} as any;
const mockCtx = {} as any;

const baseState: GSDState = {
  activeMilestone: { id: "M001", title: "Test Milestone" },
  activeSlice: { id: "S01", title: "Test Slice" },
  activeTask: { id: "T01", title: "Test Task" },
  phase: "researching",
  recentDecisions: [],
  blockers: [],
  nextAction: "test",
  registry: [],
  extensions: {},
};

const baseContext = {
  basePath: "/test",
  pi: mockPi,
  ctx: mockCtx,
  state: baseState,
  resolveTaskFile: (_: string) => null,
  resolveSliceFile: (_: string) => null,
  resolveMilestoneFile: (_: string) => null,
};

// ═══════════════════════════════════════════════════════════════════════════
// registerHook tests
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n=== registerHook: adds hook to registry ===");
{
  clearRegisteredHooks();
  const hook: HookRegistration = {
    name: "test-hook",
    middleware: async () => {},
  };
  registerHook(hook);
  const hooks = getRegisteredHooks();
  assertEq(hooks.length, 1, "should have 1 hook");
  assertEq(hooks[0].name, "test-hook", "hook name should match");
}

console.log("\n=== registerHook: overwrites same name ===");
{
  clearRegisteredHooks();
  registerHook({ name: "test", middleware: async () => {} });
  registerHook({ name: "test", middleware: async () => {} });
  const hooks = getRegisteredHooks();
  assertEq(hooks.length, 1, "should deduplicate by name");
}

console.log("\n=== registerHook: defaults priority to 50 ===");
{
  clearRegisteredHooks();
  registerHook({ name: "test", middleware: async () => {} });
  const hooks = getRegisteredHooks();
  assertEq(hooks[0].priority, 50, "default priority should be 50");
}

console.log("\n=== registerHook: respects custom priority ===");
{
  clearRegisteredHooks();
  registerHook({ name: "test", middleware: async () => {}, priority: 75 });
  const hooks = getRegisteredHooks();
  assertEq(hooks[0].priority, 75, "custom priority should be 75");
}

// ═══════════════════════════════════════════════════════════════════════════
// getRegisteredHooks tests
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n=== getRegisteredHooks: sorts by priority (highest first) ===");
{
  clearRegisteredHooks();
  registerHook({ name: "low", middleware: async () => {}, priority: 10 });
  registerHook({ name: "high", middleware: async () => {}, priority: 100 });
  registerHook({ name: "medium", middleware: async () => {}, priority: 50 });
  const hooks = getRegisteredHooks();
  const names = hooks.map((h) => h.name);
  assertEq(names, ["high", "medium", "low"], "should sort by priority descending");
}

console.log("\n=== getRegisteredHooks: returns empty array when no hooks ===");
{
  clearRegisteredHooks();
  const hooks = getRegisteredHooks();
  assertEq(hooks, [], "should return empty array");
}

// ═══════════════════════════════════════════════════════════════════════════
// executeMiddlewareChain tests
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n=== executeMiddlewareChain: creates working state copy ===");
{
  clearRegisteredHooks();
  let receivedContext: HookContext | undefined;
  registerHook({
    name: "capture",
    middleware: async (ctx) => {
      receivedContext = ctx;
    },
  });
  await executeMiddlewareChain(baseState, baseContext);
  assert(receivedContext !== undefined, "should receive context");
  assertEq(receivedContext!.workingState, baseState, "workingState should equal baseState");
  assert(receivedContext!.workingState !== baseState, "workingState should be a copy, not same reference");
}

console.log("\n=== executeMiddlewareChain: provides immutable state snapshot ===");
{
  clearRegisteredHooks();
  let receivedContext: HookContext | undefined;
  registerHook({
    name: "capture",
    middleware: async (ctx) => {
      receivedContext = ctx;
    },
  });
  await executeMiddlewareChain(baseState, baseContext);
  assert(receivedContext!.state === baseState, "state should be same reference");
}

console.log("\n=== executeMiddlewareChain: executes hooks in priority order ===");
{
  clearRegisteredHooks();
  const executionOrder: string[] = [];
  registerHook({
    name: "second",
    middleware: async (_, next) => {
      executionOrder.push("second");
      await next();
    },
    priority: 50,
  });
  registerHook({
    name: "first",
    middleware: async (_, next) => {
      executionOrder.push("first");
      await next();
    },
    priority: 100,
  });
  await executeMiddlewareChain(baseState, baseContext);
  assertEq(executionOrder, ["first", "second"], "should execute by priority");
}

console.log("\n=== executeMiddlewareChain: getExtensionData/setExtensionData ===");
{
  clearRegisteredHooks();
  let receivedData: unknown;
  registerHook({
    name: "data",
    middleware: async (ctx, next) => {
      ctx.setExtensionData("test", { foo: "bar" });
      receivedData = ctx.getExtensionData("test");
      await next();
    },
  });
  await executeMiddlewareChain(baseState, baseContext);
  assertEq(receivedData, { foo: "bar" }, "should store and retrieve extension data");
}

console.log("\n=== executeMiddlewareChain: stops chain when decision is set ===");
{
  clearRegisteredHooks();
  const executionOrder: string[] = [];
  registerHook({
    name: "decision",
    middleware: async (ctx) => {
      executionOrder.push("decision");
      ctx.decision = { unitType: "test", unitId: "test", prompt: "test" };
    },
    priority: 100,
  });
  registerHook({
    name: "should-not-run",
    middleware: async () => {
      executionOrder.push("should-not-run");
    },
    priority: 50,
  });
  const result = await executeMiddlewareChain(baseState, baseContext);
  assertEq(executionOrder, ["decision"], "should stop after decision");
  assertEq(result.decision!.unitType, "test", "should return decision");
}

console.log("\n=== executeMiddlewareChain: isolates hook errors ===");
{
  clearRegisteredHooks();
  const executionOrder: string[] = [];
  registerHook({
    name: "error",
    middleware: async (_, next) => {
      executionOrder.push("error");
      throw new Error("Hook error");
    },
    priority: 100,
  });
  registerHook({
    name: "recovery",
    middleware: async (_, next) => {
      executionOrder.push("recovery");
      await next();
    },
    priority: 50,
  });
  await executeMiddlewareChain(baseState, baseContext);
  assertEq(executionOrder, ["error", "recovery"], "should continue after error");
}

console.log("\n=== executeMiddlewareChain: handles empty registry ===");
{
  clearRegisteredHooks();
  const result = await executeMiddlewareChain(baseState, baseContext);
  assertEq(result.workingState, baseState, "should return working state");
  assert(result.decision === undefined, "should have no decision");
}

// ═══════════════════════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n" + "=".repeat(70));
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log("=".repeat(70));

if (failed > 0) {
  process.exit(1);
}
