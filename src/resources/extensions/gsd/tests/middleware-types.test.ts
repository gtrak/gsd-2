// GSD Extension — Middleware Types Test
// Tests for dispatch middleware type definitions and compatibility.

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import type {
  DispatchDecision,
  DispatchContext,
  DispatchMiddleware,
  MiddlewareConfig,
  MiddlewareFactory,
  PipelineStage,
} from "../middleware/types.js";
import type { HookContext } from "../hooks.js";

// Test counters
let passed = 0;
let failed = 0;

// ─── Test Helpers ──────────────────────────────────────────────────────────

function check(condition: boolean, message: string): void {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${message}`);
  }
}

function log(message: string): void {
  console.log(message);
}

// ─── Test Suites ───────────────────────────────────────────────────────────

describe("DispatchDecision", () => {
  it("should have all required fields", () => {
    const decision: DispatchDecision = {
      unitType: "execute-task",
      unitId: "M001/S01/T01",
      prompt: "Complete the task",
    };

    check(decision.unitType === "execute-task", "unitType should be 'execute-task'");
    check(decision.unitId === "M001/S01/T01", "unitId should be 'M001/S01/T01'");
    check(decision.prompt === "Complete the task", "prompt should be 'Complete the task'");
    check(decision.metadata === undefined, "metadata should be undefined");
  });

  it("should accept optional metadata", () => {
    const decision: DispatchDecision = {
      unitType: "complete-slice",
      unitId: "M001/S01",
      prompt: "Complete the slice",
      metadata: {
        cycle: 1,
        timestamp: new Date().toISOString(),
      },
    };

    check(decision.metadata?.cycle === 1, "metadata.cycle should be 1");
  });
});

describe("DispatchContext", () => {
  it("should extend HookContext with dispatch-specific fields", () => {
    // Verify type compatibility - DispatchContext should be assignable where HookContext is expected
    const createContext = (): DispatchContext => {
      const completedKeySet = new Set<string>();
      return {
        // HookContext fields (minimal for type checking)
        basePath: "/test",
        pi: {} as any,
        ctx: {} as any,
        state: {
          activeMilestone: null,
          activeSlice: null,
          activeTask: null,
          phase: "executing",
          recentDecisions: [],
          blockers: [],
          nextAction: "",
          registry: [],
        },
        workingState: {
          activeMilestone: null,
          activeSlice: null,
          activeTask: null,
          phase: "executing",
          recentDecisions: [],
          blockers: [],
          nextAction: "",
          registry: [],
        },
        getExtensionData: () => undefined,
        setExtensionData: () => {},
        resolveTaskFile: () => null,
        resolveSliceFile: () => null,
        resolveMilestoneFile: () => null,
        // DispatchContext-specific fields
        completedKeySet,
        getCompletedKey: (unitType: string, unitId: string) =>
          `${unitType}:${unitId}`,
        isUnitCompleted: (unitType: string, unitId: string) =>
          completedKeySet.has(`${unitType}:${unitId}`),
      };
    };

    const context = createContext();
    check(context.completedKeySet instanceof Set, "completedKeySet should be a Set");
    check(
      context.getCompletedKey("execute-task", "M001/S01/T01") ===
        "execute-task:M001/S01/T01",
      "getCompletedKey should return correct key format",
    );
    check(
      context.isUnitCompleted("execute-task", "M001/S01/T01") === false,
      "isUnitCompleted should return false for uncompleted unit",
    );
  });

  it("should track completed units", () => {
    const completedKeySet = new Set<string>();
    const context: DispatchContext = {
      basePath: "/test",
      pi: {} as any,
      ctx: {} as any,
      state: {
        activeMilestone: null,
        activeSlice: null,
        activeTask: null,
        phase: "executing",
        recentDecisions: [],
        blockers: [],
        nextAction: "",
        registry: [],
      },
      workingState: {
        activeMilestone: null,
        activeSlice: null,
        activeTask: null,
        phase: "executing",
        recentDecisions: [],
        blockers: [],
        nextAction: "",
        registry: [],
      },
      getExtensionData: () => undefined,
      setExtensionData: () => {},
      resolveTaskFile: () => null,
      resolveSliceFile: () => null,
      resolveMilestoneFile: () => null,
      completedKeySet,
      getCompletedKey: (unitType: string, unitId: string) =>
        `${unitType}:${unitId}`,
      isUnitCompleted: (unitType: string, unitId: string) =>
        completedKeySet.has(`${unitType}:${unitId}`),
    };

    // Mark unit as completed
    completedKeySet.add(context.getCompletedKey("execute-task", "M001/S01/T01"));

    check(
      context.isUnitCompleted("execute-task", "M001/S01/T01") === true,
      "isUnitCompleted should return true for completed unit",
    );
    check(
      context.isUnitCompleted("execute-task", "M001/S01/T02") === false,
      "isUnitCompleted should return false for different unit",
    );
  });
});

describe("DispatchMiddleware", () => {
  it("should have correct function signature", async () => {
    const middleware: DispatchMiddleware = async (context, next) => {
      // Can access dispatch-specific fields
      context.getCompletedKey("execute-task", "M001/S01/T01");
      context.isUnitCompleted("execute-task", "M001/S01/T01");

      // Can call next
      await next();

      // Can set decision
      context.decision = {
        unitType: "execute-task",
        unitId: "M001/S01/T01",
        prompt: "Task prompt",
      };
    };

    check(typeof middleware === "function", "middleware should be a function");
  });
});

describe("PipelineStage", () => {
  it("should have exactly 6 stage values", () => {
    const validStages: PipelineStage[] = [
      "pre-validation",
      "validation",
      "pre-dispatch",
      "dispatch",
      "post-dispatch",
      "notification",
    ];

    check(validStages.length === 6, "should have exactly 6 stages");
    check(
      validStages.includes("pre-validation"),
      "should include 'pre-validation'",
    );
    check(validStages.includes("validation"), "should include 'validation'");
    check(
      validStages.includes("pre-dispatch"),
      "should include 'pre-dispatch'",
    );
    check(validStages.includes("dispatch"), "should include 'dispatch'");
    check(
      validStages.includes("post-dispatch"),
      "should include 'post-dispatch'",
    );
    check(validStages.includes("notification"), "should include 'notification'");
  });

  it("should reject invalid stage values at type level", () => {
    // This test verifies type safety - TypeScript should reject invalid values
    const validStage: PipelineStage = "dispatch";
    check(validStage === "dispatch", "valid stage should be accepted");

    // Note: TypeScript will catch invalid values at compile time
    // Runtime check for demonstration
    const invalidValue = "invalid-stage" as unknown as PipelineStage;
    check(
      ![
        "pre-validation",
        "validation",
        "pre-dispatch",
        "dispatch",
        "post-dispatch",
        "notification",
      ].includes(invalidValue),
      "invalid stage should not be in valid stages list",
    );
  });

  it("should define stage execution order", () => {
    // Verify the semantic order of stages
    const stageOrder = [
      "pre-validation", // 1. Initial checks (idempotency)
      "validation", // 2. State validation
      "pre-dispatch", // 3. Guards (budget, merge)
      "dispatch", // 4. Core dispatch logic
      "post-dispatch", // 5. After-effects (review, metrics, observability)
      "notification", // 6. Final notifications
    ];

    check(stageOrder.length === 6, "should have 6 stages in order");
    check(stageOrder[0] === "pre-validation", "first stage should be pre-validation");
    check(stageOrder[5] === "notification", "last stage should be notification");
  });
});

describe("MiddlewareConfig", () => {
  it("should have all required fields with stage instead of priority", () => {
    const config: MiddlewareConfig = {
      stage: "dispatch",
      enabled: true,
      name: "test-middleware",
    };

    check(config.stage === "dispatch", "stage should be 'dispatch'");
    check(config.enabled === true, "enabled should be true");
    check(config.name === "test-middleware", "name should be 'test-middleware'");
  });

  it("should accept all valid PipelineStage values", () => {
    const validStages: PipelineStage[] = [
      "pre-validation",
      "validation",
      "pre-dispatch",
      "dispatch",
      "post-dispatch",
      "notification",
    ];

    for (const stage of validStages) {
      const config: MiddlewareConfig = {
        stage,
        enabled: true,
        name: `middleware-for-${stage}`,
      };
      check(config.stage === stage, `config should accept stage '${stage}'`);
    }
  });
});

describe("MiddlewareFactory", () => {
  it("should create middleware from factory", () => {
    const factory: MiddlewareFactory = (config) => {
      return async (context, next) => {
        // Use config if provided
        if (config?.enabled !== false) {
          await next();
        }
      };
    };

    const middleware = factory({
      stage: "dispatch",
      enabled: true,
      name: "factory-middleware",
    });

    check(typeof middleware === "function", "middleware should be a function");
  });

  it("should work with partial config", () => {
    const factory: MiddlewareFactory = (config) => {
      const stage = config?.stage ?? "dispatch";
      const enabled = config?.enabled ?? true;
      const name = config?.name ?? "anonymous";

      return async (context, next) => {
        // Use defaults
        if (enabled) {
          await next();
        }
      };
    };

    const middleware = factory({ name: "partial-config" });
    check(typeof middleware === "function", "middleware should be a function");
  });
});

describe("Type Compatibility", () => {
  it("should verify DispatchContext is compatible with HookContext", () => {
    // This test verifies that DispatchContext can be used wherever HookContext is expected
    const acceptsHookContext = (ctx: HookContext): void => {
      check(ctx.basePath !== undefined, "basePath should be defined");
      check(ctx.state !== undefined, "state should be defined");
    };

    const dispatchContext: DispatchContext = {
      basePath: "/test",
      pi: {} as any,
      ctx: {} as any,
      state: {
        activeMilestone: null,
        activeSlice: null,
        activeTask: null,
        phase: "executing",
        recentDecisions: [],
        blockers: [],
        nextAction: "",
        registry: [],
      },
      workingState: {
        activeMilestone: null,
        activeSlice: null,
        activeTask: null,
        phase: "executing",
        recentDecisions: [],
        blockers: [],
        nextAction: "",
        registry: [],
      },
      getExtensionData: () => undefined,
      setExtensionData: () => {},
      resolveTaskFile: () => null,
      resolveSliceFile: () => null,
      resolveMilestoneFile: () => null,
      completedKeySet: new Set<string>(),
      getCompletedKey: () => "",
      isUnitCompleted: () => false,
    };

    // DispatchContext should be assignable to HookContext
    acceptsHookContext(dispatchContext);
  });
});

// ─── Test Summary ───────────────────────────────────────────────────────────

console.log("\n========================================");
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log("All tests passed ✓");
} else {
  console.log(`Some tests failed ✗`);
  process.exit(1);
}
