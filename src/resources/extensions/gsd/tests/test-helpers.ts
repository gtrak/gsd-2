// GSD Extension — Shared Test Helpers
// Common utilities for middleware unit tests

import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { DispatchContext } from "../middleware/types.js";
import type { GSDState } from "../types.js";

// ─── Test Counters ──────────────────────────────────────────────────────────

export let passed = 0;
export let failed = 0;

// ─── Assertion Helpers ──────────────────────────────────────────────────────

/**
 * Basic assertion helper that tracks pass/fail counts.
 */
export function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${message}`);
  }
}

/**
 * Equality assertion using JSON.stringify for comparison.
 */
export function assertEq<T>(actual: T, expected: T, message: string): void {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed++;
  } else {
    failed++;
    console.error(
      `  FAIL: ${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

/**
 * Assert that a value is not undefined.
 */
export function assertNotUndefined<T>(actual: T, message: string): void {
  if (actual !== undefined) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${message} — expected not undefined, got undefined`);
  }
}

/**
 * Assert that a value is null or undefined.
 */
export function assertNull<T>(actual: T, message: string): void {
  if (actual === null || actual === undefined) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${message} — expected null/undefined, got ${JSON.stringify(actual)}`);
  }
}

/**
 * Assert that actual is greater than expected.
 */
export function assertGt(actual: number, expected: number, message: string): void {
  if (actual > expected) {
    passed++;
  } else {
    failed++;
    console.error(
      `  FAIL: ${message} — expected ${actual} > ${expected}`,
    );
  }
}

/**
 * Assert that actual is greater than or equal to expected.
 */
export function assertGte(actual: number, expected: number, message: string): void {
  if (actual >= expected) {
    passed++;
  } else {
    failed++;
    console.error(
      `  FAIL: ${message} — expected ${actual} >= ${expected}`,
    );
  }
}

/**
 * Assert that a value is null or undefined (not called).
 */
export function assertNotCalled<T>(actual: T, message: string): void {
  if (actual === undefined || actual === null) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${message} — expected not called, but was called`);
  }
}

// ─── Test Directory Helpers ─────────────────────────────────────────────────

/**
 * Creates a temporary test directory with cleanup function.
 */
export function createTestDir(): { dir: string; cleanup: () => void } {
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

// ─── Mock Objects ───────────────────────────────────────────────────────────

/**
 * Mock ExtensionAPI object.
 */
export const mockPi = {} as any;

/**
 * Mock ExtensionContext object with no-op notify.
 */
export const mockCtx = {
  ui: {
    notify: () => {},
  },
} as any;

/**
 * Base GSDState object for tests.
 */
export const baseState: GSDState = {
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

/**
 * Creates a mock DispatchContext for testing.
 */
export function createMockContext(
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

/**
 * Creates a mock context with a local notifyMessages array for tracking notifications.
 */
export function createMockContextWithNotify(
  basePath: string,
  notifyMessages: Array<{ message: string; type: string }>,
  state: GSDState = baseState,
): DispatchContext {
  const mockCtxWithNotify = {
    ui: {
      notify: (message: string, type: string) => {
        notifyMessages.push({ message, type });
      },
    },
  } as any;

  return {
    basePath,
    pi: mockPi,
    ctx: mockCtxWithNotify,
    state,
    workingState: { ...state },
    getExtensionData: () => undefined,
    setExtensionData: () => {},
    resolveTaskFile: () => null,
    resolveSliceFile: () => null,
    resolveMilestoneFile: () => null,
    completedKeySet: new Set(),
    pendingDecision: undefined,
    getCompletedKey: (unitType: string, unitId: string) => `${unitType}/${unitId}`,
    isUnitCompleted: (unitType: string, unitId: string) => false,
  };
}
