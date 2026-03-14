// GSD Extension — Notifications Middleware
// Sends notifications at key dispatch lifecycle points.
// This middleware runs near the end of the chain (Priority 55).

import type {
  DispatchContext,
  MiddlewareConfig,
  DispatchMiddleware,
} from "./types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Configuration for notifications middleware.
 */
export interface NotificationsConfig {
  /**
   * Whether the middleware is enabled.
   * @default true
   */
  enabled?: boolean;

  /**
   * Priority of the middleware (0-100).
   * @default 55
   */
  priority?: number;

  /**
   * Name of the middleware for identification.
   * @default "notifications"
   */
  name?: string;

  /**
   * Callback invoked when dispatch is starting, before next() is called.
   * @param ctx - The dispatch context
   */
  onDispatchStart?: (ctx: DispatchContext) => Promise<void> | void;

  /**
   * Callback invoked after next() returns successfully.
   * @param ctx - The dispatch context
   */
  onDispatchComplete?: (ctx: DispatchContext) => Promise<void> | void;

  /**
   * Callback invoked if next() throws an error.
   * @param ctx - The dispatch context
   * @param error - The error that was thrown
   */
  onDispatchError?: (ctx: DispatchContext, error: Error) => Promise<void> | void;

  /**
   * Optional filter to conditionally enable notifications based on unit type.
   * If provided, notifications are only sent for matching unit types.
   */
  unitTypeFilter?: string[];
}

// ─── Constants ─────────────────────────────────────────────────────────────

/**
 * Default priority for notifications middleware.
 * Priority 55 to ensure it runs after metrics (65) but before custom middlewares (default 50).
 */
const DEFAULT_PRIORITY = 55;

// ─── Middleware Factory ────────────────────────────────────────────────────

/**
 * Creates the notifications middleware.
 *
 * This middleware provides hooks for sending notifications at key dispatch
 * lifecycle points. It supports onDispatchStart, onDispatchComplete, and
 * onDispatchError callbacks. Callbacks are wrapped in try/catch to prevent
 * errors from breaking the middleware chain.
 *
 * @param config - Optional configuration for the middleware
 * @param config.enabled - Whether the middleware is enabled (default: true)
 * @param config.priority - Priority of the middleware (default: 55)
 * @param config.name - Name of the middleware (default: "notifications")
 * @param config.onDispatchStart - Callback for dispatch start events
 * @param config.onDispatchComplete - Callback for successful dispatch completion
 * @param config.onDispatchError - Callback for dispatch errors
 * @param config.unitTypeFilter - Optional filter for unit types
 * @returns A DispatchMiddleware function
 *
 * @example
 * ```typescript
 * const middleware = createNotificationsMiddleware({
 *   onDispatchStart: (ctx) => {
 *     console.log(`Dispatch starting for ${ctx.pendingDecision?.unitType}`);
 *   },
 *   onDispatchComplete: (ctx) => {
 *     console.log(`Dispatch completed for ${ctx.decision?.unitType}`);
 *   },
 *   onDispatchError: (ctx, error) => {
 *     console.error(`Dispatch failed: ${error.message}`);
 *   },
 * });
 * ```
 */
export function createNotificationsMiddleware(
  config?: Partial<NotificationsConfig>,
): DispatchMiddleware {
  const priority = config?.priority ?? DEFAULT_PRIORITY;
  const enabled = config?.enabled ?? true;
  const name = config?.name ?? "notifications";
  const onDispatchStart = config?.onDispatchStart;
  const onDispatchComplete = config?.onDispatchComplete;
  const onDispatchError = config?.onDispatchError;
  const unitTypeFilter = config?.unitTypeFilter;

  // Return a no-op middleware if disabled
  if (!enabled) {
    const disabledMiddleware: DispatchMiddleware = async () => {
      // Disabled middleware does nothing
    };
    (disabledMiddleware as DispatchMiddleware & { __metadata?: { name: string; priority: number } }).__metadata = {
      name,
      priority,
    };
    return disabledMiddleware;
  }

  // Return a no-op middleware if no callbacks provided
  if (!onDispatchStart && !onDispatchComplete && !onDispatchError) {
    const noOpMiddleware: DispatchMiddleware = async (_context, next) => {
      await next();
    };
    (noOpMiddleware as DispatchMiddleware & { __metadata?: { name: string; priority: number } }).__metadata = {
      name,
      priority,
    };
    return noOpMiddleware;
  }

  // Helper to check if notifications should be sent based on unit type filter
  function shouldSendNotification(ctx: DispatchContext): boolean {
    if (!unitTypeFilter || unitTypeFilter.length === 0) {
      return true;
    }
    const unitType = ctx.decision?.unitType ?? ctx.pendingDecision?.unitType;
    if (!unitType) {
      return true; // No unit type means no filter to apply
    }
    return unitTypeFilter.includes(unitType);
  }

  const middleware: DispatchMiddleware = async (context, next) => {
    // Check if we should send notifications based on unit type filter
    const shouldNotify = shouldSendNotification(context);

    // Invoke onDispatchStart callback if provided
    if (onDispatchStart && shouldNotify) {
      try {
        await onDispatchStart(context);
      } catch (cbErr) {
        // Silently swallow errors from callbacks to prevent breaking the chain
        // eslint-disable-next-line no-console
        console.error(`[NotificationsMiddleware] Callback error: ${cbErr instanceof Error ? cbErr.message : String(cbErr)}`);
      }
    }

    let error: unknown = undefined;
    try {
      // Call next() to continue the middleware chain
      await next();
    } catch (err) {
      // Capture error but don't rethrow yet
      error = err;
    }

    // Invoke appropriate callback based on outcome
    if (error !== undefined) {
      // Dispatch failed - invoke error callback
      if (onDispatchError && shouldNotify) {
        const errorObj = error instanceof Error ? error : new Error(String(error));
        try {
          await onDispatchError(context, errorObj);
        } catch (cbErr) {
          // Silently swallow errors from callbacks to prevent breaking the chain
          // eslint-disable-next-line no-console
          console.error(`[NotificationsMiddleware] Callback error: ${cbErr instanceof Error ? cbErr.message : String(cbErr)}`);
        }
      }
      // Rethrow the error to propagate it up the chain
      throw error;
    } else {
      // Dispatch succeeded - invoke complete callback
      if (onDispatchComplete && shouldNotify) {
        try {
          await onDispatchComplete(context);
        } catch (cbErr) {
          // Silently swallow errors from callbacks to prevent breaking the chain
          // eslint-disable-next-line no-console
          console.error(`[NotificationsMiddleware] Callback error: ${cbErr instanceof Error ? cbErr.message : String(cbErr)}`);
        }
      }
    }
  };

  // Attach metadata for identification
  (middleware as DispatchMiddleware & { __metadata?: { name: string; priority: number } }).__metadata = {
    name,
    priority,
  };

  return middleware;
}
