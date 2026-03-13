// GSD Extension — Hook System
// Middleware-based hook system for intercepting state transitions.
// Hooks can modify working state, make dispatch decisions, and persist data.

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { GSDState } from "./types.js";

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
