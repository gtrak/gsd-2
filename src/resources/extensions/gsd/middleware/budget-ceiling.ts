// GSD Extension — Budget Ceiling Middleware
// Checks if the project budget ceiling has been exceeded and pauses auto-mode if so.
// This middleware runs at Priority 95, after idempotency checks but before dispatch.

import type {
  DispatchContext,
  DispatchDecision,
  MiddlewareConfig,
  DispatchMiddleware,
} from "./types.js";
import { getLedger, getProjectTotals, formatCost } from "../metrics.js";
import { loadEffectiveGSDPreferences } from "../preferences.js";

// ─── Constants ─────────────────────────────────────────────────────────────

/**
 * Default priority for budget ceiling middleware.
 * Priority 95 — runs after idempotency (100) but before other dispatch middleware.
 */
const DEFAULT_PRIORITY = 95;

/**
 * Decision object used to signal that auto-mode should be paused
 * because the budget ceiling has been reached.
 */
export const PAUSE_DECISION: DispatchDecision = {
  unitType: "pause",
  unitId: "budget-ceiling",
  prompt: "",
  metadata: {
    reason: "budget_ceiling_reached",
  },
};

// ─── Middleware Factory ────────────────────────────────────────────────────

/**
 * Creates the budget ceiling middleware.
 *
 * This middleware checks if the project's total cost has reached or exceeded
 * the configured budget ceiling. If so, it notifies the user and pauses
 * auto-mode to prevent further spending.
 *
 * @param config - Optional configuration for the middleware
 * @param config.priority - Priority of the middleware (default: 95)
 * @param config.enabled - Whether the middleware is enabled (default: true)
 * @param config.name - Name of the middleware (default: "budget-ceiling")
 * @returns A DispatchMiddleware function
 *
 * @example
 * ```typescript
 * const middleware = createBudgetCeilingMiddleware({ priority: 95 });
 * ```
 */
export function createBudgetCeilingMiddleware(
  config?: Partial<MiddlewareConfig>,
): DispatchMiddleware {
  const priority = config?.priority ?? DEFAULT_PRIORITY;
  const enabled = config?.enabled ?? true;
  const name = config?.name ?? "budget-ceiling";

  // Return a no-op middleware if disabled
  if (!enabled) {
    return async () => {
      // Disabled middleware does nothing
    };
  }

  const middleware: DispatchMiddleware = async (context, next) => {
    // Load preferences to check for budget ceiling
    const prefs = loadEffectiveGSDPreferences()?.preferences;
    const budgetCeiling = prefs?.budget_ceiling;

    // If no budget ceiling is set, pass through immediately
    if (budgetCeiling === undefined) {
      await next();
      return;
    }

    // Get current ledger and calculate total cost
    const currentLedger = getLedger();
    const totalCost = currentLedger
      ? getProjectTotals(currentLedger.units).cost
      : 0;

    // Check if budget ceiling has been reached or exceeded
    if (totalCost >= budgetCeiling) {
      // Notify the user with warning
      context.ctx.ui.notify(
        `Budget ceiling ${formatCost(budgetCeiling)} reached (spent ${formatCost(totalCost)}). Pausing auto-mode — /gsd auto to continue.`,
        "warning",
      );

      // Set the pause decision with budget metadata
      context.decision = {
        ...PAUSE_DECISION,
        metadata: {
          ...PAUSE_DECISION.metadata,
          budgetCeiling,
          totalCost,
        },
      };

      // DO NOT call next() — we're making a decision to pause
      return;
    }

    // Under budget — pass through to next middleware
    await next();
  };

  // Attach metadata for identification
  (middleware as DispatchMiddleware & { __metadata?: { name: string; priority: number } }).__metadata = {
    name,
    priority,
  };

  return middleware;
}
