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

import type { DispatchMiddleware, MiddlewareConfig } from "./types.js";
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
 * Composes all dispatch middlewares with default configurations.
 *
 * Returns middlewares sorted by priority (highest first):
 * - idempotency (100)
 * - budget-ceiling (95)
 * - merge-guard (90)
 * - uat-dispatch (85)
 * - reassessment (80)
 * - phase-dispatch (75)
 * - code-review (70)
 * - observability (60)
 *
 * @returns An array of DispatchMiddleware functions sorted by priority
 *
 * @example
 * ```typescript
 * const middlewares = composeDispatchMiddlewares();
 * ```
 */
export function composeDispatchMiddlewares(): DispatchMiddleware[] {
  const middlewares = [
    createIdempotencyMiddleware(),      // 100
    createBudgetCeilingMiddleware(),    // 95
    createMergeGuardMiddleware(),       // 90
    createUatDispatchMiddleware(),      // 85
    createReassessmentMiddleware(),     // 80
    createPhaseDispatchMiddleware(),    // 75
    createCodeReviewMiddleware(),       // 70
    createObservabilityMiddleware(),    // 60
  ];

  // Sort by priority (highest first)
  return middlewares.sort((a, b) => {
    const priorityA = (a as DispatchMiddleware & { __metadata?: { priority: number } }).__metadata?.priority ?? 50;
    const priorityB = (b as DispatchMiddleware & { __metadata?: { priority: number } }).__metadata?.priority ?? 50;
    return priorityB - priorityA;
  });
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
