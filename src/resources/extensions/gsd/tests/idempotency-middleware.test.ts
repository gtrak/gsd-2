// GSD Extension — Idempotency Middleware Tests
// Unit tests for createIdempotencyMiddleware

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { createIdempotencyMiddleware, SKIP_DECISION } from "../middleware/idempotency.js";
import type { DispatchContext, MiddlewareConfig, PipelineStage } from "../middleware/types.js";
import type { GSDState } from "../types.js";
import {
  passed,
  failed,
  assert,
  assertEq,
  createTestDir,
} from "./test-helpers.js";

// Create the milestone and slice directory structure
// This is required for resolveExpectedArtifactPath to work correctly
function createMilestoneSliceStructure(dir: string, milestoneId: string, sliceId: string): void {
  const sliceDir = join(dir, ".gsd", "milestones", milestoneId, "slices", sliceId);
  mkdirSync(sliceDir, { recursive: true });
}

// Create the expected artifact file for execute-task
// Path: .gsd/milestones/M001/slices/S01/tasks/T01-SUMMARY.md
function createExecuteTaskArtifact(dir: string, milestoneId: string, sliceId: string, taskId: string): void {
  createMilestoneSliceStructure(dir, milestoneId, sliceId);
  const tasksDir = join(dir, ".gsd", "milestones", milestoneId, "slices", sliceId, "tasks");
  mkdirSync(tasksDir, { recursive: true });
  writeFileSync(join(tasksDir, `${taskId}-SUMMARY.md`), `# Task Summary\n\nDone.`);
}

// Create the expected artifact file for complete-slice
// Path: .gsd/milestones/M001/slices/S01/S01-SUMMARY.md
function createCompleteSliceArtifact(dir: string, milestoneId: string, sliceId: string): void {
  createMilestoneSliceStructure(dir, milestoneId, sliceId);
  const sliceDir = join(dir, ".gsd", "milestones", milestoneId, "slices", sliceId);
  writeFileSync(join(sliceDir, `${sliceId}-SUMMARY.md`), `# Slice Summary\n\nDone.`);
}

// Mock ExtensionAPI and ExtensionContext
const mockPi = {} as any;
const mockCtx = {
  ui: {
    notify: () => {},
  },
} as any;

const baseState: GSDState = {
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

// Create a mock DispatchContext
function createMockContext(
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

// ─── Tests ─────────────────────────────────────────────────────────────────

console.log("\n=== Idempotency Middleware Tests ===\n");

// Test 1: should pass through when no pending decision exists
console.log("=== should pass through when no pending decision exists ===");
{
  const { dir, cleanup } = createTestDir();

  const middleware = createIdempotencyMiddleware();
  const context = createMockContext(dir);
  let nextCalled = false;

  const next = async () => {
    nextCalled = true;
  };

  middleware(context, next).then(() => {
    assert(nextCalled, "next() should be called when no pending decision");
    assert(context.decision === undefined, "decision should remain undefined");
  });

  cleanup();
}

// Test 2: should skip when unit is completed and artifact exists
console.log("\n=== should skip when unit is completed and artifact exists ===");
{
  const { dir, cleanup } = createTestDir();

  // Create the expected artifact file for execute-task
  createExecuteTaskArtifact(dir, "M001", "S01", "T01");

  const middleware = createIdempotencyMiddleware();
  const completedKeySet = new Set(["execute-task/M001/S01/T01"]);
  const context = createMockContext(dir, completedKeySet, {
    unitType: "execute-task",
    unitId: "M001/S01/T01",
    prompt: "Test prompt",
  });
  let nextCalled = false;

  const next = async () => {
    nextCalled = true;
  };

  middleware(context, next).then(() => {
    assert(!nextCalled, "next() should NOT be called when skipping");
    assertEq(context.decision, SKIP_DECISION, "decision should be SKIP_DECISION");
    assert(
      context.completedKeySet.has("execute-task/M001/S01/T01"),
      "key should remain in completedKeySet",
    );
  });

  cleanup();
}

// Test 3: should re-run when unit is completed but artifact is missing
console.log("\n=== should re-run when unit is completed but artifact is missing ===");
{
  const { dir, cleanup } = createTestDir();

  // Create the milestone/slice structure, but NOT the artifact file
  // This ensures resolveExpectedArtifactPath returns a valid path
  createMilestoneSliceStructure(dir, "M001", "S01");

  const middleware = createIdempotencyMiddleware();
  const completedKeySet = new Set(["execute-task/M001/S01/T01"]);
  const context = createMockContext(dir, completedKeySet, {
    unitType: "execute-task",
    unitId: "M001/S01/T01",
    prompt: "Test prompt",
  });
  let nextCalled = false;

  const next = async () => {
    nextCalled = true;
  };

  middleware(context, next).then(() => {
    assert(nextCalled, "next() should be called when re-running");
    assert(
      context.decision === undefined,
      "decision should be undefined when re-running",
    );
    assert(
      !context.completedKeySet.has("execute-task/M001/S01/T01"),
      "key should be removed from completedKeySet",
    );
  });

  cleanup();
}

// Test 4: should pass through when unit is not completed
console.log("\n=== should pass through when unit is not completed ===");
{
  const { dir, cleanup } = createTestDir();

  const middleware = createIdempotencyMiddleware();
  const completedKeySet = new Set<string>(); // Empty set
  const context = createMockContext(dir, completedKeySet, {
    unitType: "execute-task",
    unitId: "M001/S01/T01",
    prompt: "Test prompt",
  });
  let nextCalled = false;

  const next = async () => {
    nextCalled = true;
  };

  middleware(context, next).then(() => {
    assert(nextCalled, "next() should be called when unit is not completed");
    assert(context.decision === undefined, "decision should remain undefined");
  });

  cleanup();
}

// Test 5: should use stage "pre-validation" by default
console.log("\n=== should use stage pre-validation by default ===");
{
  const middleware = createIdempotencyMiddleware();
  const metadata = (middleware as any).__metadata;
  assertEq(metadata.stage, "pre-validation" as PipelineStage, "default stage should be pre-validation");
  assertEq(metadata.name, "idempotency", "default name should be 'idempotency'");
}

// Test 6: should allow custom stage via config
console.log("\n=== should allow custom stage via config ===");
{
  const config: Partial<MiddlewareConfig> = {
    stage: "dispatch" as PipelineStage,
    name: "custom-idempotency",
  };
  const middleware = createIdempotencyMiddleware(config);
  const metadata = (middleware as any).__metadata;
  assertEq(metadata.stage, "dispatch" as PipelineStage, "custom stage should be dispatch");
  assertEq(metadata.name, "custom-idempotency", "custom name should be used");
}

// Test 7: should be disabled when enabled: false
console.log("\n=== should be disabled when enabled: false ===");
{
  const { dir, cleanup } = createTestDir();

  const config: Partial<MiddlewareConfig> = {
    enabled: false,
  };
  const middleware = createIdempotencyMiddleware(config);
  const context = createMockContext(dir);
  let nextCalled = false;

  const next = async () => {
    nextCalled = true;
  };

  middleware(context, next).then(() => {
    assert(!nextCalled, "next() should NOT be called when disabled");
    assert(context.decision === undefined, "decision should remain undefined");
  });

  cleanup();
}

// Test 8: SKIP_DECISION constant structure
console.log("\n=== SKIP_DECISION constant structure ===");
{
  assertEq(SKIP_DECISION.unitType, "skip", "unitType should be 'skip'");
  assertEq(SKIP_DECISION.unitId, "already-completed", "unitId should be 'already-completed'");
  assertEq(SKIP_DECISION.prompt, "", "prompt should be empty");
  assertEq(SKIP_DECISION.metadata?.skip, true, "metadata.skip should be true");
}

// ─── Summary ────────────────────────────────────────────────────────────────

console.log("\n" + "=".repeat(70));
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log("=".repeat(70));

if (failed > 0) {
  process.exit(1);
}
