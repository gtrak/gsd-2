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
} from "./types.js";

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

// ─── Decision Constant Exports ─────────────────────────────────────────────

/**
 * Export decision constants used by middlewares.
 */
export { SKIP_DECISION } from "./idempotency.js";
export { PAUSE_DECISION } from "./budget-ceiling.js";
export { MERGE_ERROR_DECISION } from "./merge-guard.js";

// ─── Compose Functions ─────────────────────────────────────────────────────

import type { DispatchMiddleware, MiddlewareConfig, GSDMiddleware, DispatchMiddlewareRegistration } from "./types.js";
import { createIdempotencyMiddleware } from "./idempotency.js";
import { createBudgetCeilingMiddleware } from "./budget-ceiling.js";
import { createMergeGuardMiddleware } from "./merge-guard.js";
import { createUatDispatchMiddleware } from "./uat-dispatch.js";
import { createReassessmentMiddleware } from "./reassessment.js";
import { createPhaseDispatchMiddleware } from "./phase-dispatch.js";
import { createCodeReviewMiddleware } from "./code-review.js";
import { createObservabilityMiddleware } from "./observability.js";

/**
 * Configuration interface for composing middleware chains with custom options.
 * Each property corresponds to a middleware and allows partial configuration.
 */
export interface MiddlewareChainConfig {
  /** Configuration for idempotency middleware (priority 100) */
  idempotency?: Partial<MiddlewareConfig>;
  /** Configuration for budget ceiling middleware (priority 95) */
  budgetCeiling?: Partial<MiddlewareConfig>;
  /** Configuration for merge guard middleware (priority 90) */
  mergeGuard?: Partial<MiddlewareConfig>;
  /** Configuration for UAT dispatch middleware (priority 85) */
  uatDispatch?: Partial<MiddlewareConfig>;
  /** Configuration for reassessment middleware (priority 80) */
  reassessment?: Partial<MiddlewareConfig>;
  /** Configuration for phase dispatch middleware (priority 75) */
  phaseDispatch?: Partial<MiddlewareConfig>;
  /** Configuration for code review middleware (priority 70) */
  codeReview?: Partial<MiddlewareConfig>;
  /** Configuration for observability middleware (priority 60) */
  observability?: Partial<MiddlewareConfig>;
}

/**
 * Composes all dispatch middlewares with custom configuration options.
 *
 * Allows enabling/disabling individual middlewares and customizing their
 * priority and name. Disabled middlewares are filtered out of the result.
 *
 * @param config - Optional configuration for each middleware
 * @returns An array of enabled DispatchMiddleware functions sorted by priority
 *
 * @example
 * ```typescript
 * const middlewares = composeDispatchMiddlewaresWithConfig({
 *   idempotency: { enabled: true },
 *   budgetCeiling: { enabled: false },
 * });
 * ```
 */
export function composeDispatchMiddlewaresWithConfig(
  config: MiddlewareChainConfig = {}
): DispatchMiddleware[] {
  const middlewares = [
    createIdempotencyMiddleware(config.idempotency),
    createBudgetCeilingMiddleware(config.budgetCeiling),
    createMergeGuardMiddleware(config.mergeGuard),
    createUatDispatchMiddleware(config.uatDispatch),
    createReassessmentMiddleware(config.reassessment),
    createPhaseDispatchMiddleware(config.phaseDispatch),
    createCodeReviewMiddleware(config.codeReview),
    createObservabilityMiddleware(config.observability),
  ].filter(m => (m as DispatchMiddleware & { __metadata?: unknown }).__metadata !== undefined);

  return middlewares.sort((a, b) => {
    const priorityA = (a as DispatchMiddleware & { __metadata?: { priority: number } }).__metadata?.priority ?? 50;
    const priorityB = (b as DispatchMiddleware & { __metadata?: { priority: number } }).__metadata?.priority ?? 50;
    return priorityB - priorityA;
  });
}

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
 * @param registration.priority - Priority of the middleware (0-100, default: 50)
 * @param registration.enabled - Whether the middleware is enabled (default: true)
 * @param registration.middleware - The middleware function
 *
 * @example
 * ```typescript
 * registerDispatchMiddleware({
 *   name: "my-custom-middleware",
 *   priority: 85,
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
  priority?: number;
  enabled?: boolean;
  middleware: DispatchMiddleware | GSDMiddleware;
}): void {
  dispatchMiddlewareRegistry.set(registration.name, {
    name: registration.name,
    priority: registration.priority ?? 50,
    enabled: registration.enabled ?? true,
    middleware: registration.middleware,
  });
}

/**
 * Get all registered custom dispatch middlewares sorted by priority.
 *
 * Returns middlewares sorted by priority (highest first).
 * Disabled middlewares are included but can be filtered by the caller.
 *
 * @returns An array of registered middleware configurations sorted by priority
 *
 * @example
 * ```typescript
 * const middlewares = getRegisteredDispatchMiddlewares();
 * for (const mw of middlewares) {
 *   console.log(`${mw.name} (priority: ${mw.priority})`);
 * }
 * ```
 */
export function getRegisteredDispatchMiddlewares(): DispatchMiddlewareRegistration[] {
  return Array.from(dispatchMiddlewareRegistry.values()).sort((a, b) => {
    return b.priority - a.priority; // Higher priority first
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
 * the sort function to read the priority correctly.
 *
 * @param middleware - The middleware function to attach metadata to
 * @param registration - The registration object containing name and priority
 * @returns The middleware with __metadata attached
 */
function attachMetadata(middleware: DispatchMiddleware, registration: { name: string; priority: number }): DispatchMiddleware {
  (middleware as DispatchMiddleware & { __metadata?: { name: string; priority: number } }).__metadata = {
    name: registration.name,
    priority: registration.priority,
  };
  return middleware;
}

/**
 * Composes all dispatch middlewares including registered custom middlewares.
 *
 * Returns middlewares sorted by priority (highest first), including:
 * - Built-in middlewares (idempotency, budget-ceiling, merge-guard, etc.)
 * - Custom middlewares registered via registerDispatchMiddleware()
 *
 * Disabled middlewares are filtered out of the result.
 *
 * @returns An array of enabled DispatchMiddleware functions sorted by priority
 *
 * @example
 * ```typescript
 * const middlewares = composeDispatchMiddlewares();
 * ```
 */
export function composeDispatchMiddlewares(): DispatchMiddleware[] {
  // Get built-in middlewares
  const builtInMiddlewares = [
    createIdempotencyMiddleware(),      // 100
    createBudgetCeilingMiddleware(),    // 95
    createMergeGuardMiddleware(),       // 90
    createUatDispatchMiddleware(),      // 85
    createReassessmentMiddleware(),     // 80
    createPhaseDispatchMiddleware(),    // 75
    createCodeReviewMiddleware(),       // 70
    createObservabilityMiddleware(),    // 60
  ];

  // Get registered custom middlewares (only enabled ones) and attach metadata
  const customMiddlewares = getRegisteredDispatchMiddlewares()
    .filter(reg => reg.enabled)
    .map(reg => attachMetadata(reg.middleware as DispatchMiddleware, { name: reg.name, priority: reg.priority }));

  // Combine all middlewares
  const allMiddlewares = [...builtInMiddlewares, ...customMiddlewares];

  // Sort by priority (highest first)
  return allMiddlewares.sort((a, b) => {
    const priorityA = (a as DispatchMiddleware & { __metadata?: { priority: number } }).__metadata?.priority ?? 50;
    const priorityB = (b as DispatchMiddleware & { __metadata?: { priority: number } }).__metadata?.priority ?? 50;
    return priorityB - priorityA;
  });
}
