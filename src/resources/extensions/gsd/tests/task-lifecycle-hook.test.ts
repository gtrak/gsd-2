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
// Summary
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n" + "=".repeat(70));
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log("=".repeat(70));

if (failed > 0) {
  process.exit(1);
}
