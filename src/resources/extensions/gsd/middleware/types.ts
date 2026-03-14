// GSD Extension — Dispatch Middleware Types
// Types specific to the dispatch middleware system for unit dispatch decisions.

import type { HookContext, GSDMiddleware } from "../hooks.js";

// ─── Pipeline Stage Type ───────────────────────────────────────────────────

/**
 * Named pipeline stages for middleware execution order.
 * Replaces magic priority numbers with explicit stage names for better intent.
 * Stages execute in the order listed below.
 */
export type PipelineStage =
  | "pre-validation" // Initial checks (idempotency)
  | "validation" // State validation
  | "pre-dispatch" // Guards (budget, merge)
  | "dispatch" // Core dispatch logic
  | "post-dispatch" // After-effects (review, metrics, observability)
  | "notification"; // Final notifications

// ─── Dispatch Decision ─────────────────────────────────────────────────────

/**
 * Represents a decision to dispatch a specific unit to the agent.
 * Middleware can set this when it wants to dispatch a unit for processing.
 */
export interface DispatchDecision {
  /**
   * The type of unit to dispatch.
   * Examples: "execute-task", "complete-slice", "complete-milestone"
   */
  unitType: string;

  /**
   * The unique identifier for the unit.
   * Examples: "M001/S01/T01" for a task, "M001/S01" for a slice
   */
  unitId: string;

  /**
   * The prompt to send to the agent for this unit.
   */
  prompt: string;

  /**
   * Optional metadata associated with the dispatch decision.
   */
  metadata?: Record<string, unknown>;
}

// ─── Dispatch Context ──────────────────────────────────────────────────────

/**
 * Extended HookContext with dispatch-specific helpers for idempotency checks.
 * Provides methods to track which units have been completed to prevent
 * duplicate dispatch decisions.
 */
export interface DispatchContext extends HookContext {
  /**
   * Set of completed unit keys for idempotency checks.
   * Keys are in the format: "<unitType>:<unitId>"
   */
  completedKeySet: Set<string>;

  /**
   * The pending dispatch decision from the auto-dispatch logic.
   * This is set before middleware chain execution begins.
   * Middleware can inspect this to make decisions about whether to proceed.
   */
  pendingDecision?: DispatchDecision;

  /**
   * Generates a unique key for a unit based on its type and ID.
   * @param unitType - The type of unit (e.g., "execute-task")
   * @param unitId - The unique identifier of the unit (e.g., "M001/S01/T01")
   * @returns A string key in the format "<unitType>:<unitId>"
   */
  getCompletedKey(unitType: string, unitId: string): string;

  /**
   * Checks if a unit has already been completed.
   * @param unitType - The type of unit (e.g., "execute-task")
   * @param unitId - The unique identifier of the unit (e.g., "M001/S01/T01")
   * @returns true if the unit has been completed, false otherwise
   */
  isUnitCompleted(unitType: string, unitId: string): boolean;
}

// ─── Dispatch Middleware Type ──────────────────────────────────────────────

/**
 * Middleware function type specialized for dispatch operations.
 * Works with DispatchContext instead of the base HookContext.
 */
export type DispatchMiddleware = (
  context: DispatchContext,
  next: () => Promise<void>
) => Promise<void>;

// ─── Middleware Configuration ──────────────────────────────────────────────

/**
 * Common configuration options for middleware registration.
 */
export interface MiddlewareConfig {
  /**
   * Pipeline stage for middleware execution order.
   * Stages execute in a fixed order: pre-validation, validation, pre-dispatch,
   * dispatch, post-dispatch, notification.
   */
  stage: PipelineStage;

  /**
   * Whether the middleware is enabled.
   * @default true
   */
  enabled: boolean;

  /**
   * Name of the middleware for identification and logging.
   */
  name: string;
}

// ─── Middleware Factory ────────────────────────────────────────────────────

/**
 * Factory function type for creating middleware with configuration.
 * @param config - Configuration options for the middleware
 * @returns A DispatchMiddleware function
 */
export type MiddlewareFactory = (
  config?: Partial<MiddlewareConfig>
) => DispatchMiddleware;

// ─── Middleware Registration ───────────────────────────────────────────────

/**
 * Configuration for registering a dispatch middleware.
 */
export interface DispatchMiddlewareRegistration {
  /**
   * Unique name for the middleware (used for deduplication).
   */
  name: string;

  /**
   * Pipeline stage for middleware execution order.
   * Stages execute in a fixed order: pre-validation, validation, pre-dispatch,
   * dispatch, post-dispatch, notification.
   */
  stage: PipelineStage;

  /**
   * Whether the middleware is enabled.
   * @default true
   */
  enabled: boolean;

  /**
   * The middleware function.
   */
  middleware: DispatchMiddleware | GSDMiddleware;
}

// ─── Re-exports for Compatibility ───────────────────────────────────────────

/**
 * Re-export GSDMiddleware for compatibility with registration API.
 */
export type { GSDMiddleware } from "../hooks.js";

