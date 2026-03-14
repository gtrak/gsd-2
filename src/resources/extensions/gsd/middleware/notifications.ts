// GSD Extension — Notifications Middleware
// Sends notifications at key dispatch events (before/after dispatch).
// This middleware runs in the "notification" stage, the last stage in the chain.

import type {
  DispatchContext,
  MiddlewareConfig,
  DispatchMiddleware,
  PipelineStage,
} from "./types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Configuration for the notifications middleware.
 */
export interface NotificationsConfig extends MiddlewareConfig {
  /**
   * Send notification when dispatch starts.
   * If true, uses default message. If string, uses custom message.
   * @default false
   */
  onDispatchStart?: boolean | string;

  /**
   * Send notification when dispatch completes.
   * If true, uses default message. If string, uses custom message.
   * @default false
   */
  onDispatchComplete?: boolean | string;

  /**
   * Send notification when an error occurs during dispatch.
   * If true, uses default message. If string, uses custom message.
   * @default false
   */
  onError?: boolean | string;
}

// ─── Constants ─────────────────────────────────────────────────────────────

/**
 * Default pipeline stage for notifications middleware.
 * Runs in the "notification" stage, the last stage in the chain.
 */
const DEFAULT_STAGE: PipelineStage = "notification";

/**
 * Default message for dispatch start notification.
 */
const DEFAULT_DISPATCH_START_MSG = "Dispatching {unitType} {unitId}";

/**
 * Default message for dispatch complete notification.
 */
const DEFAULT_DISPATCH_COMPLETE_MSG = "Dispatched {unitType} {unitId}";

/**
 * Default message for error notification.
 */
const DEFAULT_ERROR_MSG = "Dispatch error: {error}";

// ─── Middleware Factory ────────────────────────────────────────────────────

/**
 * Creates the notifications middleware.
 *
 * This middleware sends notifications at key dispatch events:
 * - Before dispatch: Notifies when dispatch is starting
 * - After dispatch: Notifies when dispatch completes
 * - On error: Notifies when an error occurs during dispatch
 *
 * Notifications use context.ctx.ui.notify() and include unit information
 * if a decision was made.
 *
 * @param config - Optional configuration for the middleware
 * @param config.stage - Pipeline stage of the middleware (default: "notification")
 * @param config.enabled - Whether the middleware is enabled (default: true)
 * @param config.name - Name of the middleware (default: "notifications")
 * @param config.onDispatchStart - Enable dispatch start notification (default: false)
 * @param config.onDispatchComplete - Enable dispatch complete notification (default: false)
 * @param config.onError - Enable error notification (default: false)
 * @returns A DispatchMiddleware function
 *
 * @example
 * ```typescript
 * const middleware = createNotificationsMiddleware({
 *   stage: "notification",
 *   onDispatchStart: true,
 *   onDispatchComplete: true,
 * });
 * ```
 *
 * @example
 * ```typescript
 * const middleware = createNotificationsMiddleware({
 *   stage: "notification",
 *   onDispatchStart: "Starting dispatch for {unitType} {unitId}",
 *   onDispatchComplete: "Completed dispatch for {unitType} {unitId}",
 *   onError: "Failed to dispatch: {error}",
 * });
 * ```
 */
export function createNotificationsMiddleware(
  config?: Partial<NotificationsConfig>,
): DispatchMiddleware {
  const stage = config?.stage ?? DEFAULT_STAGE;
  const enabled = config?.enabled ?? true;
  const name = config?.name ?? "notifications";
  const onDispatchStart = config?.onDispatchStart ?? false;
  const onDispatchComplete = config?.onDispatchComplete ?? false;
  const onError = config?.onError ?? false;

  // Return a no-op middleware if disabled
  if (!enabled) {
    return async () => {
      // Disabled middleware does nothing
    };
  }

  /**
   * Formats a notification message with unit information.
   * @param message - The message template
   * @param context - The dispatch context
   * @returns The formatted message
   */
  function formatMessage(message: string, context: DispatchContext): string {
    let formatted = message;

    // Replace {unitType} and {unitId} placeholders
    const unitType = context.decision?.unitType ?? "unknown";
    const unitId = context.decision?.unitId ?? "unknown";

    formatted = formatted.replace(/\{unitType\}/g, unitType);
    formatted = formatted.replace(/\{unitId\}/g, unitId);

    // Replace {error} placeholder if present
    if (context.workingState.extensions?._notificationsError) {
      const error = context.workingState.extensions._notificationsError as string;
      formatted = formatted.replace(/\{error\}/g, error);
    }

    return formatted;
  }

  /**
   * Sends a notification using context.ctx.ui.notify().
   * Handles errors gracefully by catching any exceptions.
   * @param context - The dispatch context
   * @param message - The message to send
   * @param type - The notification type (default: "info")
   */
  function notify(context: DispatchContext, message: string, type: "info" | "warning" | "error" = "info"): void {
    try {
      context.ctx.ui.notify(message, type);
    } catch {
      // Gracefully handle notification failures - do not throw
    }
  }

  const middleware: DispatchMiddleware = async (context, next) => {
    let error: unknown = undefined;

    // Send dispatch start notification if enabled
    if (onDispatchStart) {
      const message = typeof onDispatchStart === "string"
        ? onDispatchStart
        : DEFAULT_DISPATCH_START_MSG;
      const formattedMessage = formatMessage(message, context);
      notify(context, formattedMessage, "info");
    }

    try {
      // Call next() to continue the middleware chain
      await next();
    } catch (err) {
      // Capture error for error notification
      error = err;

      // Store error in extensions for message formatting
      if (!context.workingState.extensions) {
        context.workingState.extensions = {};
      }
      context.workingState.extensions._notificationsError =
        err instanceof Error ? err.message : String(err);

      // Send error notification if enabled
      if (onError) {
        const message = typeof onError === "string"
          ? onError
          : DEFAULT_ERROR_MSG;
        const formattedMessage = formatMessage(message, context);
        notify(context, formattedMessage, "error");
      }

      // Re-throw the error
      throw err;
    }

    // Send dispatch complete notification if enabled
    if (onDispatchComplete) {
      const message = typeof onDispatchComplete === "string"
        ? onDispatchComplete
        : DEFAULT_DISPATCH_COMPLETE_MSG;
      const formattedMessage = formatMessage(message, context);
      notify(context, formattedMessage, "info");
    }
  };

  // Attach metadata for identification
  (middleware as DispatchMiddleware & { __metadata?: { name: string; stage: PipelineStage } }).__metadata = {
    name,
    stage,
  };

  return middleware;
}
