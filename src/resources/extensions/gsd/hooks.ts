// GSD Extension — Hook System
// Middleware-based hook system for intercepting state transitions.
// Hooks can modify working state, make dispatch decisions, and persist data.

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { GSDState } from "./types.js";
import {
  resolveTaskFile as resolveTaskFilePath,
  resolveSliceFile as resolveSliceFilePath,
  resolveMilestoneFile as resolveMilestoneFilePath,
} from "./paths.js";

// ─── Hook Context ─────────────────────────────────────────────────────────

export interface HookContext {
  // Immutable inputs
  readonly basePath: string;
  readonly pi: ExtensionAPI;
  readonly ctx: ExtensionContext;

  // Current state (immutable snapshot)
  readonly state: GSDState;

  // Working state - hooks apply transformations
  workingState: GSDState;

  // Decision override
  decision?: {
    unitType: string;
    unitId: string;
    prompt: string;
    metadata?: Record<string, unknown>;
  };

  // Helper methods
  getExtensionData: <T>(hookName: string) => T | undefined;
  setExtensionData: <T>(hookName: string, data: T) => void;
  resolveTaskFile: (filename: string) => string | null;
  resolveSliceFile: (filename: string) => string | null;
  resolveMilestoneFile: (filename: string) => string | null;
}

// ─── Middleware Types ───────────────────────────────────────────────────────

export type GSDMiddleware = (
  context: HookContext,
  next: () => Promise<void>
) => Promise<void>;

export interface HookRegistration {
  name: string;
  middleware: GSDMiddleware;
  priority?: number; // 0-100, default 50
}

// ─── Registry ───────────────────────────────────────────────────────────────

// Singleton registry - maps hook name to registration
const hookRegistry = new Map<string, HookRegistration>();

/**
 * Register a hook with the GSD system.
 * Later registrations with the same name will overwrite earlier ones.
 */
export function registerHook(registration: HookRegistration): void {
  hookRegistry.set(registration.name, {
    ...registration,
    priority: registration.priority ?? 50,
  });
}

/**
 * Get all registered hooks sorted by priority (highest first).
 */
export function getRegisteredHooks(): HookRegistration[] {
  return Array.from(hookRegistry.values()).sort((a, b) => {
    const pa = a.priority ?? 50;
    const pb = b.priority ?? 50;
    return pb - pa; // Higher priority first
  });
}

/**
 * Clear all registered hooks. Useful for testing.
 */
export function clearRegisteredHooks(): void {
  hookRegistry.clear();
}

// ─── Middleware Chain Execution ─────────────────────────────────────────────

export async function executeMiddlewareChain(
  state: GSDState,
  context: Omit<
    HookContext,
    "workingState" | "getExtensionData" | "setExtensionData" | "decision"
  >,
): Promise<HookContext> {
  // Deep clone state for working copy
  const workingState = structuredClone
    ? structuredClone(state)
    : JSON.parse(JSON.stringify(state));

  // Initialize extensions if not present
  if (!workingState.extensions) {
    workingState.extensions = {};
  }

  // Build full context with helpers
  const fullContext: HookContext = {
    ...context,
    workingState,
    decision: undefined,
    getExtensionData: <T>(hookName: string): T | undefined => {
      return workingState.extensions?.[hookName] as T | undefined;
    },
    setExtensionData: <T>(hookName: string, data: T): void => {
      if (!workingState.extensions) {
        workingState.extensions = {};
      }
      workingState.extensions[hookName] = data;
    },
    resolveTaskFile: (filename: string): string | null => {
      const mid = workingState.activeMilestone?.id;
      const sid = workingState.activeSlice?.id;
      const tid = workingState.activeTask?.id;
      if (!mid || !sid || !tid) return null;
      return resolveTaskFilePath(
        context.basePath,
        mid,
        sid,
        tid,
        filename.replace(/\.md$/, "").toUpperCase(),
      );
    },
    resolveSliceFile: (filename: string): string | null => {
      const mid = workingState.activeMilestone?.id;
      const sid = workingState.activeSlice?.id;
      if (!mid || !sid) return null;
      return resolveSliceFilePath(
        context.basePath,
        mid,
        sid,
        filename.replace(/\.md$/, "").toUpperCase(),
      );
    },
    resolveMilestoneFile: (filename: string): string | null => {
      const mid = workingState.activeMilestone?.id;
      if (!mid) return null;
      return resolveMilestoneFilePath(
        context.basePath,
        mid,
        filename.replace(/\.md$/, "").toUpperCase(),
      );
    },
  };

  // Get hooks sorted by priority (highest first)
  const hooks = getRegisteredHooks();

  // Execute chain
  let index = 0;
  async function next(): Promise<void> {
    // If decision has been made, stop the chain
    if (fullContext.decision) {
      return;
    }

    const hook = hooks[index++];
    if (!hook) return;

    try {
      await hook.middleware(fullContext, next);
    } catch (error) {
      // Log error but continue to next hook (error isolation)
      console.error(`Hook "${hook.name}" error:`, error);
      await next();
    }
  }

  await next();
  return fullContext;
}
