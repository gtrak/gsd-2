// GSD Extension — Hook System Tests
// Unit tests for registerHook, getRegisteredHooks, executeMiddlewareChain

import { describe, it, expect, beforeEach } from "vitest";
import {
  registerHook,
  getRegisteredHooks,
  clearRegisteredHooks,
  executeMiddlewareChain,
  type HookRegistration,
  type HookContext,
  type GSDMiddleware,
} from "./hooks.js";
import type { GSDState } from "./types.js";

// Mock ExtensionAPI and ExtensionContext
const mockPi = {} as any;
const mockCtx = {} as any;

describe("hook registry", () => {
  beforeEach(() => {
    clearRegisteredHooks();
  });

  describe("registerHook", () => {
    it("should add a hook to the registry", () => {
      const hook: HookRegistration = {
        name: "test-hook",
        middleware: async () => {},
      };

      registerHook(hook);
      const hooks = getRegisteredHooks();

      expect(hooks).toHaveLength(1);
      expect(hooks[0].name).toBe("test-hook");
    });

    it("should overwrite existing hook with same name", () => {
      const hook1: HookRegistration = {
        name: "test-hook",
        middleware: async () => {},
      };
      const hook2: HookRegistration = {
        name: "test-hook",
        middleware: async () => {},
      };

      registerHook(hook1);
      registerHook(hook2);
      const hooks = getRegisteredHooks();

      expect(hooks).toHaveLength(1);
      expect(hooks[0].name).toBe("test-hook");
    });

    it("should default priority to 50", () => {
      const hook: HookRegistration = {
        name: "test-hook",
        middleware: async () => {},
      };

      registerHook(hook);
      const hooks = getRegisteredHooks();

      expect(hooks[0].priority).toBe(50);
    });

    it("should respect custom priority", () => {
      const hook: HookRegistration = {
        name: "test-hook",
        middleware: async () => {},
        priority: 75,
      };

      registerHook(hook);
      const hooks = getRegisteredHooks();

      expect(hooks[0].priority).toBe(75);
    });
  });

  describe("getRegisteredHooks", () => {
    it("should return hooks sorted by priority (highest first)", () => {
      const highPriority: HookRegistration = {
        name: "high",
        middleware: async () => {},
        priority: 100,
      };
      const lowPriority: HookRegistration = {
        name: "low",
        middleware: async () => {},
        priority: 10,
      };
      const mediumPriority: HookRegistration = {
        name: "medium",
        middleware: async () => {},
        priority: 50,
      };

      registerHook(lowPriority);
      registerHook(highPriority);
      registerHook(mediumPriority);

      const hooks = getRegisteredHooks();
      const names = hooks.map((h) => h.name);

      expect(names).toEqual(["high", "medium", "low"]);
    });

    it("should return empty array when no hooks registered", () => {
      const hooks = getRegisteredHooks();
      expect(hooks).toEqual([]);
    });
  });

  describe("clearRegisteredHooks", () => {
    it("should remove all hooks from registry", () => {
      registerHook({
        name: "hook1",
        middleware: async () => {},
      });

      clearRegisteredHooks();
      const hooks = getRegisteredHooks();

      expect(hooks).toHaveLength(0);
    });
  });
});

describe("executeMiddlewareChain", () => {
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

  beforeEach(() => {
    clearRegisteredHooks();
  });

  it("should create a working state copy", async () => {
    let receivedContext: HookContext | undefined;

    registerHook({
      name: "capture-hook",
      middleware: async (ctx) => {
        receivedContext = ctx;
      },
    });

    await executeMiddlewareChain(baseState, baseContext);

    expect(receivedContext).toBeDefined();
    expect(receivedContext!.workingState).toEqual(baseState);
    expect(receivedContext!.workingState).not.toBe(baseState); // Different reference
  });

  it("should provide immutable state snapshot", async () => {
    let receivedContext: HookContext | undefined;

    registerHook({
      name: "capture-hook",
      middleware: async (ctx) => {
        receivedContext = ctx;
      },
    });

    await executeMiddlewareChain(baseState, baseContext);

    expect(receivedContext!.state).toBe(baseState);
    expect(receivedContext!.state).toEqual(baseState);
  });

  it("should execute hooks in priority order", async () => {
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

    expect(executionOrder).toEqual(["first", "second"]);
  });

  it("should provide getExtensionData helper", async () => {
    let receivedData: unknown;

    registerHook({
      name: "data-hook",
      middleware: async (ctx, next) => {
        ctx.setExtensionData("test-data", { foo: "bar" });
        receivedData = ctx.getExtensionData("test-data");
        await next();
      },
    });

    await executeMiddlewareChain(baseState, baseContext);

    expect(receivedData).toEqual({ foo: "bar" });
  });

  it("should persist extension data to working state", async () => {
    registerHook({
      name: "data-hook",
      middleware: async (ctx, next) => {
        ctx.setExtensionData("myHook", { value: 42 });
        await next();
      },
    });

    const result = await executeMiddlewareChain(baseState, baseContext);

    expect(result.workingState.extensions).toBeDefined();
    expect(result.workingState.extensions!.myHook).toEqual({ value: 42 });
  });

  it("should stop chain when decision is set", async () => {
    const executionOrder: string[] = [];

    registerHook({
      name: "decision-hook",
      middleware: async (ctx) => {
        executionOrder.push("decision");
        ctx.decision = {
          unitType: "test-unit",
          unitId: "test-id",
          prompt: "test prompt",
        };
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

    expect(executionOrder).toEqual(["decision"]);
    expect(result.decision).toEqual({
      unitType: "test-unit",
      unitId: "test-id",
      prompt: "test prompt",
    });
  });

  it("should isolate hook errors and continue chain", async () => {
    const executionOrder: string[] = [];

    registerHook({
      name: "error-hook",
      middleware: async (_, next) => {
        executionOrder.push("error");
        throw new Error("Hook error");
      },
      priority: 100,
    });

    registerHook({
      name: "recovery-hook",
      middleware: async (_, next) => {
        executionOrder.push("recovery");
        await next();
      },
      priority: 50,
    });

    await executeMiddlewareChain(baseState, baseContext);

    expect(executionOrder).toEqual(["error", "recovery"]);
  });

  it("should pass correct context to next()", async () => {
    let childContext: HookContext | undefined;

    registerHook({
      name: "parent",
      middleware: async (ctx, next) => {
        ctx.setExtensionData("parent", true);
        await next();
      },
    });

    registerHook({
      name: "child",
      middleware: async (ctx) => {
        childContext = ctx;
      },
    });

    await executeMiddlewareChain(baseState, baseContext);

    expect(childContext!.getExtensionData("parent")).toBe(true);
  });

  it("should handle empty hook registry", async () => {
    const result = await executeMiddlewareChain(baseState, baseContext);

    expect(result.workingState).toEqual(baseState);
    expect(result.decision).toBeUndefined();
  });

  it("should provide file resolution helpers", async () => {
    let receivedContext: HookContext | undefined;

    registerHook({
      name: "file-hook",
      middleware: async (ctx) => {
        receivedContext = ctx;
      },
    });

    await executeMiddlewareChain(baseState, baseContext);

    expect(typeof receivedContext!.resolveTaskFile).toBe("function");
    expect(typeof receivedContext!.resolveSliceFile).toBe("function");
    expect(typeof receivedContext!.resolveMilestoneFile).toBe("function");
  });

  it("should return null from file resolvers when no active milestone", async () => {
    const stateWithoutMilestone: GSDState = {
      ...baseState,
      activeMilestone: null,
      activeSlice: null,
      activeTask: null,
    };

    let receivedContext: HookContext | undefined;

    registerHook({
      name: "file-hook",
      middleware: async (ctx) => {
        receivedContext = ctx;
      },
    });

    await executeMiddlewareChain(stateWithoutMilestone, baseContext);

    expect(receivedContext!.resolveMilestoneFile("test")).toBeNull();
    expect(receivedContext!.resolveSliceFile("test")).toBeNull();
    expect(receivedContext!.resolveTaskFile("test")).toBeNull();
  });
});
