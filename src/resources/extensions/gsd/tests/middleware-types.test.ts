// GSD Extension — Middleware Types Test
// Tests for dispatch middleware type definitions and compatibility.

import { describe, it, expect } from "vitest";
import type {
  DispatchDecision,
  DispatchContext,
  DispatchMiddleware,
  MiddlewareConfig,
  MiddlewareFactory,
} from "../middleware/types.js";
import type { HookContext } from "../hooks.js";

describe("DispatchDecision", () => {
  it("should have all required fields", () => {
    const decision: DispatchDecision = {
      unitType: "execute-task",
      unitId: "M001/S01/T01",
      prompt: "Complete the task",
    };

    expect(decision.unitType).toBe("execute-task");
    expect(decision.unitId).toBe("M001/S01/T01");
    expect(decision.prompt).toBe("Complete the task");
    expect(decision.metadata).toBeUndefined();
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

    expect(decision.metadata?.cycle).toBe(1);
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
    expect(context.completedKeySet).toBeInstanceOf(Set);
    expect(context.getCompletedKey("execute-task", "M001/S01/T01")).toBe(
      "execute-task:M001/S01/T01",
    );
    expect(context.isUnitCompleted("execute-task", "M001/S01/T01")).toBe(false);
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

    expect(context.isUnitCompleted("execute-task", "M001/S01/T01")).toBe(true);
    expect(context.isUnitCompleted("execute-task", "M001/S01/T02")).toBe(false);
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

    expect(typeof middleware).toBe("function");
  });
});

describe("MiddlewareConfig", () => {
  it("should have all required fields with defaults", () => {
    const config: MiddlewareConfig = {
      priority: 75,
      enabled: true,
      name: "test-middleware",
    };

    expect(config.priority).toBe(75);
    expect(config.enabled).toBe(true);
    expect(config.name).toBe("test-middleware");
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
      priority: 60,
      enabled: true,
      name: "factory-middleware",
    });

    expect(typeof middleware).toBe("function");
  });

  it("should work with partial config", () => {
    const factory: MiddlewareFactory = (config) => {
      const priority = config?.priority ?? 50;
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
    expect(typeof middleware).toBe("function");
  });
});

describe("Type Compatibility", () => {
  it("should verify DispatchContext is compatible with HookContext", () => {
    // This test verifies that DispatchContext can be used wherever HookContext is expected
    const acceptsHookContext = (ctx: HookContext): void => {
      expect(ctx.basePath).toBeDefined();
      expect(ctx.state).toBeDefined();
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
