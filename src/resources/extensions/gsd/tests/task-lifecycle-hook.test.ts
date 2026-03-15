// GSD Extension — Task Lifecycle Middleware Tests

import { createTaskLifecycleMiddleware, summarizeMustHaves, type TaskLifecycleData } from "../task-lifecycle-hook.js";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { GSDState } from "../types.js";
import type { DispatchContext } from "../middleware/types.js";
import { promises as fs } from "node:fs";

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

const mockPi = {} as ExtensionAPI;
const mockCtx = {} as ExtensionContext;

// ═══════════════════════════════════════════════════════════════════════════
// createTaskLifecycleMiddleware tests
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n=== createTaskLifecycleMiddleware: returns function ===");
{
  const middleware = createTaskLifecycleMiddleware({ basePath: "/test", pi: mockPi, ctx: mockCtx });
  assert(typeof middleware === "function", "createTaskLifecycleMiddleware should return a function");
}

console.log("\n=== createTaskLifecycleMiddleware: disabled middleware is no-op ===");
{
  let called = false;
  const middleware = createTaskLifecycleMiddleware({
    basePath: "/test",
    pi: mockPi,
    ctx: mockCtx,
    enabled: false,
  });
  
  // Create a minimal mock context
  const mockContext: DispatchContext = {
    basePath: "/test",
    pi: mockPi,
    ctx: mockCtx,
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

  await middleware(mockContext, async () => {
    called = true;
  });
  
  assert(called, "disabled middleware should call next()");
}

console.log("\n=== createTaskLifecycleMiddleware: middleware has metadata ===");
{
  const middleware = createTaskLifecycleMiddleware({ basePath: "/test", pi: mockPi, ctx: mockCtx });
  const metadata = (middleware as any).__metadata;
  assertEq(metadata?.name, "task-lifecycle", "middleware should have name metadata");
  assertEq(metadata?.stage, "dispatch", "middleware should have stage metadata");
}

// ═══════════════════════════════════════════════════════════════════════════
// summarizeMustHaves tests
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n=== summarizeMustHaves: empty array ===");
{
  const result = summarizeMustHaves([]);
  assertEq(result, "No must-haves defined.", "should return no must-haves message");
}

console.log("\n=== summarizeMustHaves: single unchecked ===");
{
  const result = summarizeMustHaves([
    { text: "Test item", checked: false },
  ]);
  assert(result.includes("Must-Haves (0/1 checked)"), "should show count");
  assert(result.includes("- [ ] Test item"), "should show unchecked item");
  assert(result.includes("1 must-have remaining"), "should show remaining count");
}

console.log("\n=== summarizeMustHaves: checked items ===");
{
  const result = summarizeMustHaves([
    { text: "First", checked: true },
    { text: "Second", checked: false },
    { text: "Third", checked: true },
  ]);
  assert(result.includes("Must-Haves (2/3 checked)"), "should show count");
  assert(result.includes("- [x] First"), "should show checked item");
  assert(result.includes("- [ ] Second"), "should show unchecked item");
  assert(result.includes("1 must-have remaining"), "should show remaining count");
}

console.log("\n=== summarizeMustHaves: all checked ===");
{
  const result = summarizeMustHaves([
    { text: "First", checked: true },
    { text: "Second", checked: true },
  ]);
  assert(result.includes("Must-Haves (2/2 checked)"), "should show all checked");
  assert(!result.includes("remaining"), "should not show remaining when all checked");
}

// ═══════════════════════════════════════════════════════════════════════════
// Integration test: middleware stores lifecycle data
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n=== Integration: middleware stores lifecycle data on execute-task ===");
{
  const taskPlanContent = `
# Task Plan

## Must-Haves
- [ ] Implement \`validateEmail\` function
- [ ] Add error handling for empty input
`;

  const mockContext: DispatchContext = {
    basePath: "/test",
    pi: mockPi,
    ctx: mockCtx,
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
    getExtensionData: <T>() => undefined,
    setExtensionData: <T>(_name: string, data: T) => {
      mockContext.workingState.extensions!["task-lifecycle"] = data;
    },
    resolveTaskFile: (filename: string) => {
      if (filename === "PLAN") return "/test/plan.md";
      return null;
    },
    resolveSliceFile: () => null,
    resolveMilestoneFile: () => null,
    completedKeySet: new Set(),
    getCompletedKey: () => "",
    isUnitCompleted: () => false,
  };

  // Mock fs.readFile to return task plan content
  const originalReadFile = fs.readFile;
  (fs as any).readFile = async (path: string, _encoding?: string) => {
    if (path === "/test/plan.md") return taskPlanContent;
    return originalReadFile(path, "utf-8");
  };

  const middleware = createTaskLifecycleMiddleware({ basePath: "/test", pi: mockPi, ctx: mockCtx });
  await middleware(mockContext, async () => {});

  const lifecycleData = mockContext.workingState.extensions?.["task-lifecycle"] as TaskLifecycleData | undefined;
  
  assert(lifecycleData !== undefined, "lifecycle data should be set");
  assertEq(lifecycleData?.taskId, "T01", "taskId should match");
  assertEq(lifecycleData?.mustHaves.length, 2, "should have 2 must-haves");
  assertEq(lifecycleData?.mustHavesAddressed, false, "mustHavesAddressed should be false initially");

  // Restore original
  (fs as any).readFile = originalReadFile;
}

// ═══════════════════════════════════════════════════════════════════════════
// Integration test: middleware parses must-haves from task plan
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n=== Integration: middleware parses must-haves from task plan ===");
{
  const taskPlanContent = `
# Task Plan

## Must-Haves
- [ ] Implement \`validateEmail\` function
- [ ] Add error handling for empty input
`;

  const mockContext: DispatchContext = {
    basePath: "/test",
    pi: mockPi,
    ctx: mockCtx,
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
    getExtensionData: <T>() => undefined,
    setExtensionData: <T>(_name: string, data: T) => {
      mockContext.workingState.extensions!["task-lifecycle"] = data;
    },
    resolveTaskFile: (filename: string) => {
      if (filename === "PLAN") return "/test/plan.md";
      return null;
    },
    resolveSliceFile: () => null,
    resolveMilestoneFile: () => null,
    completedKeySet: new Set(),
    getCompletedKey: () => "",
    isUnitCompleted: () => false,
  };

  // Mock fs.readFile to return task plan content
  const originalReadFile = fs.readFile;
  (fs as any).readFile = async (path: string, _encoding?: string) => {
    if (path === "/test/plan.md") return taskPlanContent;
    return originalReadFile(path, "utf-8");
  };

  const middleware = createTaskLifecycleMiddleware({ basePath: "/test", pi: mockPi, ctx: mockCtx });
  await middleware(mockContext, async () => {});

  const lifecycleData = mockContext.workingState.extensions?.["task-lifecycle"] as TaskLifecycleData | undefined;
  
  assert(lifecycleData !== undefined, "lifecycle data should be set");
  assertEq(lifecycleData?.taskId, "T01", "taskId should match");
  assertEq(lifecycleData?.mustHaves.length, 2, "should have 2 must-haves");
  assertEq(lifecycleData?.mustHaves[0].text, "Implement `validateEmail` function", "first must-have text should match");
  assertEq(lifecycleData?.mustHaves[1].text, "Add error handling for empty input", "second must-have text should match");
  assertEq(lifecycleData?.mustHavesAddressed, false, "mustHavesAddressed should be false initially");

  // Restore original
  (fs as any).readFile = originalReadFile;
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
