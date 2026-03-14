// GSD Extension — Dispatch Middleware Index
// Exports all middleware factories, types, and compose functions.

// ─── Type Exports ───────────────────────────────────────────────────────────

/**
 * Export all dispatch middleware types.
 */
export type {
  DispatchContext,
  DispatchDecision,
  DispatchMiddleware,
  MiddlewareConfig,
  MiddlewareFactory,
  DispatchMiddlewareRegistration,
  GSDMiddleware,
  PipelineStage,
} from "./types.js";
export type { NotificationsConfig } from "./notifications.js";
export type { ValidationConfig, ValidatorConfig, ValidatorFunction, ValidationResult, ValidationResults } from "./validation.js";

// ─── Middleware Factory Exports ────────────────────────────────────────────

/**
 * Export all middleware factory functions.
 */
export { createIdempotencyMiddleware } from "./idempotency.js";
export { createBudgetCeilingMiddleware } from "./budget-ceiling.js";
export { createMergeGuardMiddleware } from "./merge-guard.js";
export { createUatDispatchMiddleware } from "./uat-dispatch.js";
export { createReassessmentMiddleware } from "./reassessment.js";
export { createPhaseDispatchMiddleware } from "./phase-dispatch.js";
export { createCodeReviewMiddleware } from "./code-review.js";
export { createObservabilityMiddleware } from "./observability.js";
export { createMetricsMiddleware } from "./metrics.js";
export { createNotificationsMiddleware } from "./notifications.js";
export { createValidationMiddleware } from "./validation.js";

// ─── Decision Constant Exports ─────────────────────────────────────────────

/**
 * Export decision constants used by middlewares.
 */
export { SKIP_DECISION } from "./idempotency.js";
export { PAUSE_DECISION } from "./budget-ceiling.js";
export { MERGE_ERROR_DECISION } from "./merge-guard.js";

// ─── Compose Functions ─────────────────────────────────────────────────────

import type { DispatchMiddleware, MiddlewareConfig, GSDMiddleware, DispatchMiddlewareRegistration, PipelineStage } from "./types.js";
import type { GSDPreferences, MiddlewarePreferences } from "../preferences.js";
import { createIdempotencyMiddleware } from "./idempotency.js";
import { createBudgetCeilingMiddleware } from "./budget-ceiling.js";
import { createMergeGuardMiddleware } from "./merge-guard.js";
import { createUatDispatchMiddleware } from "./uat-dispatch.js";
import { createReassessmentMiddleware } from "./reassessment.js";
import { createPhaseDispatchMiddleware } from "./phase-dispatch.js";
import { createCodeReviewMiddleware } from "./code-review.js";
import { createObservabilityMiddleware } from "./observability.js";
import { createMetricsMiddleware } from "./metrics.js";
import { createNotificationsMiddleware } from "./notifications.js";
import { createValidationMiddleware } from "./validation.js";

/**
 * Pipeline stage order for sorting middlewares.
 * Stages execute in this order: pre-validation → validation → pre-dispatch → dispatch → post-dispatch → notification
 */
const STAGE_ORDER: Record<PipelineStage, number> = {
  "pre-validation": 0,
  "validation": 1,
  "pre-dispatch": 2,
  "dispatch": 3,
  "post-dispatch": 4,
  "notification": 5,
};

// ─── Unified Middleware Registration ────────────────────────────────────────

/**
 * Singleton registry for custom dispatch middlewares.
 * Maps middleware name to registration.
 */
const dispatchMiddlewareRegistry = new Map<string, DispatchMiddlewareRegistration>();

/**
 * Register a custom dispatch middleware.
 *
 * This function allows registering both DispatchMiddleware and GSDMiddleware
 * types. Later registrations with the same name will overwrite earlier ones.
 *
 * @param registration - Configuration for the middleware registration
 * @param registration.name - Unique name for the middleware (used for deduplication)
 * @param registration.stage - Pipeline stage of the middleware (default: "dispatch")
 * @param registration.enabled - Whether the middleware is enabled (default: true)
 * @param registration.middleware - The middleware function
 *
 * @example
 * ```typescript
 * registerDispatchMiddleware({
 *   name: "my-custom-middleware",
 *   stage: "dispatch",
 *   enabled: true,
 *   middleware: async (context, next) => {
 *     // Custom logic before next middleware
 *     await next();
 *     // Custom logic after next middleware
 *   }
 * });
 * ```
 */
export function registerDispatchMiddleware(registration: {
  name: string;
  stage?: PipelineStage;
  enabled?: boolean;
  middleware: DispatchMiddleware | GSDMiddleware;
}): void {
  dispatchMiddlewareRegistry.set(registration.name, {
    name: registration.name,
    stage: registration.stage ?? "dispatch",
    enabled: registration.enabled ?? true,
    middleware: registration.middleware,
  });
}

/**
 * Get all registered custom dispatch middlewares sorted by stage.
 *
 * Returns middlewares sorted by stage (pre-validation first, notification last).
 * Disabled middlewares are included but can be filtered by the caller.
 *
 * @returns An array of registered middleware configurations sorted by stage
 *
 * @example
 * ```typescript
 * const middlewares = getRegisteredDispatchMiddlewares();
 * for (const mw of middlewares) {
 *   console.log(`${mw.name} (stage: ${mw.stage})`);
 * }
 * ```
 */
export function getRegisteredDispatchMiddlewares(): DispatchMiddlewareRegistration[] {
  return Array.from(dispatchMiddlewareRegistry.values()).sort((a, b) => {
    return STAGE_ORDER[a.stage] - STAGE_ORDER[b.stage]; // Earlier stages first
  });
}

/**
 * Clear all registered custom dispatch middlewares.
 *
 * Useful for testing to reset the registry between tests.
 *
 * @example
 * ```typescript
 * clearRegisteredDispatchMiddlewares();
 * ```
 */
export function clearRegisteredDispatchMiddlewares(): void {
  dispatchMiddlewareRegistry.clear();
}

// ─── Compose Function with Custom Middlewares ───────────────────────────────

/**
 * Attaches metadata to a middleware function.
 *
 * This helper function adds __metadata property to a middleware, allowing
 * the sort function to read the stage correctly.
 *
 * @param middleware - The middleware function to attach metadata to
 * @param registration - The registration object containing name and stage
 * @returns The middleware with __metadata attached
 */
function attachMetadata(middleware: DispatchMiddleware, registration: { name: string; stage: PipelineStage }): DispatchMiddleware {
  (middleware as DispatchMiddleware & { __metadata?: { name: string; stage: PipelineStage } }).__metadata = {
    name: registration.name,
    stage: registration.stage,
  };
  return middleware;
}

/**
 * Composes all dispatch middlewares including registered custom middlewares.
 *
 * Returns middlewares sorted by stage (pre-validation first, notification last), including:
 * - Built-in middlewares (idempotency, budget-ceiling, merge-guard, etc.)
 * - Custom middlewares registered via registerDispatchMiddleware()
 *
 * Disabled middlewares are filtered out of the result.
 *
 * @returns An array of enabled DispatchMiddleware functions sorted by stage
 *
 * @example
 * ```typescript
 * const middlewares = composeDispatchMiddlewares();
 * ```
 */
export function composeDispatchMiddlewares(): DispatchMiddleware[] {
  // Get built-in middlewares
  const builtInMiddlewares = [
    createIdempotencyMiddleware(),      // pre-validation
    createValidationMiddleware(),       // validation
    createBudgetCeilingMiddleware(),    // pre-dispatch
    createMergeGuardMiddleware(),       // pre-dispatch
    createUatDispatchMiddleware(),      // dispatch
    createReassessmentMiddleware(),     // dispatch
    createPhaseDispatchMiddleware(),    // dispatch
    createCodeReviewMiddleware(),       // dispatch
    createMetricsMiddleware(),          // post-dispatch
    createObservabilityMiddleware(),    // post-dispatch
    createNotificationsMiddleware(),    // notification
  ];

  // Get registered custom middlewares (only enabled ones) and attach metadata
  const customMiddlewares = getRegisteredDispatchMiddlewares()
    .filter(reg => reg.enabled)
    .map(reg => attachMetadata(reg.middleware as DispatchMiddleware, { name: reg.name, stage: reg.stage }));

  // Combine all middlewares
  const allMiddlewares = [...builtInMiddlewares, ...customMiddlewares];

  // Sort by stage (earlier stages first)
  return allMiddlewares.sort((a, b) => {
    const stageA = (a as DispatchMiddleware & { __metadata?: { stage: PipelineStage } }).__metadata?.stage ?? "dispatch";
    const stageB = (b as DispatchMiddleware & { __metadata?: { stage: PipelineStage } }).__metadata?.stage ?? "dispatch";
    return STAGE_ORDER[stageA] - STAGE_ORDER[stageB];
  });
}

// ─── Compose Function with Preferences ─────────────────────────────────────

/**
 * Default stages for built-in middlewares.
 */
export const DEFAULT_MIDDLEWARE_STAGES: Record<string, PipelineStage> = {
  idempotency: "pre-validation",
  validation: "validation",
  "budget-ceiling": "pre-dispatch",
  "merge-guard": "pre-dispatch",
  "uat-dispatch": "dispatch",
  reassessment: "dispatch",
  "phase-dispatch": "dispatch",
  "code-review": "dispatch",
  metrics: "post-dispatch",
  observability: "post-dispatch",
  notifications: "notification",
};

/**
 * Composes dispatch middlewares using GSD preferences configuration.
 *
 * This function allows configuring middlewares via preferences.md, supporting:
 * - Enabling/disabling individual middlewares
 * - Overriding middleware stages
 * - Merging global and project preferences
 *
 * If no middleware configuration is provided, all built-in middlewares are
 * returned with their default stages.
 *
 * @param prefs - GSD preferences containing optional middleware configuration
 * @returns An array of enabled DispatchMiddleware functions sorted by stage
 *
 * @example
 * ```typescript
 * const prefs = loadEffectiveGSDPreferences()?.preferences ?? {};
 * const middlewares = composeDispatchMiddlewaresWithPreferences(prefs);
 * ```
 *
 * @example
 * ```yaml
 * # In preferences.md
 * gsd:
 *   middleware:
 *     enabled:
 *       - name: idempotency
 *         stage: pre-validation
 *       - name: budget-ceiling
 *         stage: pre-dispatch
 *     disabled:
 *       - uat-dispatch
 * ```
 */
export function composeDispatchMiddlewaresWithPreferences(prefs: GSDPreferences): DispatchMiddleware[] {
  // Get middleware preferences from GSD preferences
  const middlewarePrefs = prefs.middleware;

  // If no middleware preferences, return all built-in middlewares with defaults
  if (!middlewarePrefs) {
    return composeDispatchMiddlewares();
  }

  // Build a map of enabled middlewares with their stages
  const enabledMap = new Map<string, PipelineStage>();
  const disabledSet = new Set<string>();

  // Process enabled middlewares
  if (middlewarePrefs.enabled && middlewarePrefs.enabled.length > 0) {
    for (const entry of middlewarePrefs.enabled) {
      if (!entry.name) continue;
      // Use the stage value if provided, otherwise use default
      const stage = entry.stage ?? DEFAULT_MIDDLEWARE_STAGES[entry.name] ?? "dispatch";
      enabledMap.set(entry.name, stage);
    }
  }

  // Process disabled middlewares
  if (middlewarePrefs.disabled && middlewarePrefs.disabled.length > 0) {
    for (const name of middlewarePrefs.disabled) {
      disabledSet.add(name);
    }
  }

  // If enabled list is specified, only include those middlewares
  const useEnabledList = middlewarePrefs.enabled && middlewarePrefs.enabled.length > 0;

  // Create middlewares based on configuration
  const middlewares: DispatchMiddleware[] = [];

  // Helper to check if a middleware should be included
  function shouldInclude(name: string): boolean {
    if (disabledSet.has(name)) return false;
    if (useEnabledList) {
      return enabledMap.has(name);
    }
    return true;
  }

  // Helper to get stage for a middleware
  function getStage(name: string): PipelineStage {
    return enabledMap.get(name) ?? DEFAULT_MIDDLEWARE_STAGES[name] ?? "dispatch";
  }

  // Create each middleware if it should be included
  if (shouldInclude("idempotency")) {
    middlewares.push(createIdempotencyMiddleware({ stage: getStage("idempotency"), enabled: true }));
  }
  if (shouldInclude("validation")) {
    middlewares.push(createValidationMiddleware({ stage: getStage("validation"), enabled: true }));
  }
  if (shouldInclude("budget-ceiling")) {
    middlewares.push(createBudgetCeilingMiddleware({ stage: getStage("budget-ceiling"), enabled: true }));
  }
  if (shouldInclude("merge-guard")) {
    middlewares.push(createMergeGuardMiddleware({ stage: getStage("merge-guard"), enabled: true }));
  }
  if (shouldInclude("uat-dispatch")) {
    middlewares.push(createUatDispatchMiddleware({ stage: getStage("uat-dispatch"), enabled: true }));
  }
  if (shouldInclude("reassessment")) {
    middlewares.push(createReassessmentMiddleware({ stage: getStage("reassessment"), enabled: true }));
  }
  if (shouldInclude("phase-dispatch")) {
    middlewares.push(createPhaseDispatchMiddleware({ stage: getStage("phase-dispatch"), enabled: true }));
  }
  if (shouldInclude("code-review")) {
    middlewares.push(createCodeReviewMiddleware({ stage: getStage("code-review"), enabled: true }));
  }
  if (shouldInclude("metrics")) {
    middlewares.push(createMetricsMiddleware({ stage: getStage("metrics"), enabled: true }));
  }
  if (shouldInclude("observability")) {
    middlewares.push(createObservabilityMiddleware({ stage: getStage("observability"), enabled: true }));
  }
  if (shouldInclude("notifications")) {
    middlewares.push(createNotificationsMiddleware({ stage: getStage("notifications"), enabled: true }));
  }

  // Add registered custom middlewares (only enabled ones)
  const customMiddlewares = getRegisteredDispatchMiddlewares()
    .filter(reg => reg.enabled && !disabledSet.has(reg.name) && (!useEnabledList || enabledMap.has(reg.name)))
    .map(reg => attachMetadata(reg.middleware as DispatchMiddleware, { name: reg.name, stage: reg.stage }));

  // Combine all middlewares
  const allMiddlewares = [...middlewares, ...customMiddlewares];

  // Sort by stage (earlier stages first)
  return allMiddlewares.sort((a, b) => {
    const stageA = (a as DispatchMiddleware & { __metadata?: { stage: PipelineStage } }).__metadata?.stage ?? "dispatch";
    const stageB = (b as DispatchMiddleware & { __metadata?: { stage: PipelineStage } }).__metadata?.stage ?? "dispatch";
    return STAGE_ORDER[stageA] - STAGE_ORDER[stageB];
  });
}
