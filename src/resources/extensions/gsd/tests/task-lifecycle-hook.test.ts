// GSD Extension — Task Lifecycle Hook Tests

import { TaskLifecycleHook, type TaskLifecycleData } from "../task-lifecycle-hook.js";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
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

const mockPi = {} as ExtensionAPI;
const mockCtx = {} as ExtensionContext;

// ═══════════════════════════════════════════════════════════════════════════
// TaskLifecycleHook tests
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n=== TaskLifecycleHook: asMiddleware returns function ===");
{
  const hook = new TaskLifecycleHook("/test", mockPi, mockCtx);
  const middleware = hook.asMiddleware();
  assert(typeof middleware === "function", "asMiddleware should return a function");
}

// ═══════════════════════════════════════════════════════════════════════════
// summarizeMustHaves tests (via handleExecuteTask)
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n=== summarizeMustHaves: empty array ===");
{
  const hook = new TaskLifecycleHook("/test", mockPi, mockCtx);
  // Access private method
  const result = (hook as any).summarizeMustHaves([]);
  assertEq(result, "No must-haves defined.", "should return no must-haves message");
}

console.log("\n=== summarizeMustHaves: single unchecked ===");
{
  const hook = new TaskLifecycleHook("/test", mockPi, mockCtx);
  const result = (hook as any).summarizeMustHaves([
    { text: "Test item", checked: false },
  ]);
  assert(result.includes("Must-Haves (0/1 checked)"), "should show count");
  assert(result.includes("- [ ] Test item"), "should show unchecked item");
  assert(result.includes("1 must-have remaining"), "should show remaining count");
}

console.log("\n=== summarizeMustHaves: checked items ===");
{
  const hook = new TaskLifecycleHook("/test", mockPi, mockCtx);
  const result = (hook as any).summarizeMustHaves([
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
  const hook = new TaskLifecycleHook("/test", mockPi, mockCtx);
  const result = (hook as any).summarizeMustHaves([
    { text: "First", checked: true },
    { text: "Second", checked: true },
  ]);
  assert(result.includes("Must-Haves (2/2 checked)"), "should show all checked");
  assert(!result.includes("remaining"), "should not show remaining when all checked");
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
