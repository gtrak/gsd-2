// GSD Extension — Validation Middleware
// Validates GSD state before dispatch and can reject invalid states.
// This middleware runs at Priority 98, after idempotency (100) but before budget-ceiling (95).

import type {
  DispatchContext,
  DispatchDecision,
  MiddlewareConfig,
  DispatchMiddleware,
} from "./types.js";
import type { GSDState, Phase } from "../types.js";

// ─── Constants ─────────────────────────────────────────────────────────────

/**
 * Default priority for validation middleware.
 * Priority 98 — runs after idempotency (100) but before budget-ceiling (95).
 */
const DEFAULT_PRIORITY = 98;

/**
 * Decision object used to signal that auto-mode should be paused
 * because validation failed.
 */
export const PAUSE_DECISION: DispatchDecision = {
  unitType: "pause",
  unitId: "validation-error",
  prompt: "",
  metadata: {
    reason: "validation_failed",
  },
};

// ─── Configuration Types ───────────────────────────────────────────────────

/**
 * Validator function type that checks a specific aspect of GSD state.
 * @param state - The current GSD state to validate
 * @returns An object indicating if validation passed and an optional message
 */
export type ValidatorFunction = (state: GSDState) => {
  valid: boolean;
  message?: string;
};

/**
 * Configuration for a single validator.
 */
export interface ValidatorConfig {
  /** Unique name for the validator */
  name: string;
  /** The validation function */
  validate: ValidatorFunction;
  /** Severity level: 'error' stops dispatch, 'warning' continues with notification */
  severity?: "error" | "warning";
}

/**
 * Configuration interface for the validation middleware.
 */
export interface ValidationConfig extends MiddlewareConfig {
  /** Array of validators to run */
  validators?: ValidatorConfig[];
  /** How to handle validation errors: 'pause' (default), 'continue', or 'throw' */
  onValidationError?: "pause" | "continue" | "throw";
}

// ─── Validation Results ────────────────────────────────────────────────────

/**
 * Result of running a single validator.
 */
export interface ValidationResult {
  /** Validator name */
  name: string;
  /** Whether validation passed */
  valid: boolean;
  /** Optional validation message */
  message?: string;
  /** Severity level */
  severity: "error" | "warning";
}

/**
 * Aggregate validation results from all validators.
 */
export interface ValidationResults {
  /** All validation results */
  results: ValidationResult[];
  /** Whether all validations passed */
  passed: boolean;
  /** Number of errors */
  errors: number;
  /** Number of warnings */
  warnings: number;
}

// ─── Default Validators ────────────────────────────────────────────────────

/**
 * Validates that an active milestone exists.
 */
export const activeMilestoneExists: ValidatorConfig = {
  name: "activeMilestoneExists",
  severity: "error",
  validate: (state: GSDState): { valid: boolean; message?: string } => {
    if (state.activeMilestone === null) {
      return {
        valid: false,
        message: "No active milestone defined",
      };
    }
    return { valid: true };
  },
};

/**
 * Validates that an active slice exists when in slice phase.
 */
export const activeSliceExists: ValidatorConfig = {
  name: "activeSliceExists",
  severity: "error",
  validate: (state: GSDState): { valid: boolean; message?: string } => {
    // Only validate when in slice-related phases
    const slicePhases: Phase[] = ["executing", "reviewing", "fixing", "verifying"];
    if (slicePhases.includes(state.phase)) {
      if (state.activeSlice === null) {
        return {
          valid: false,
          message: `No active slice defined while in ${state.phase} phase`,
        };
      }
    }
    return { valid: true };
  },
};

/**
 * Validates that an active task exists when in task phase.
 */
export const activeTaskExists: ValidatorConfig = {
  name: "activeTaskExists",
  severity: "error",
  validate: (state: GSDState): { valid: boolean; message?: string } => {
    // Only validate when in task-related phases
    const taskPhases: Phase[] = ["executing", "reviewing", "fixing", "verifying"];
    if (taskPhases.includes(state.phase)) {
      if (state.activeTask === null) {
        return {
          valid: false,
          message: `No active task defined while in ${state.phase} phase`,
        };
      }
    }
    return { valid: true };
  },
};

/**
 * Default validators to use if none are specified.
 */
export const DEFAULT_VALIDATORS: ValidatorConfig[] = [
  activeMilestoneExists,
  activeSliceExists,
  activeTaskExists,
];

// ─── Validation Helper Functions ───────────────────────────────────────────

/**
 * Runs all validators against the current state and returns results.
 * @param validators - Array of validators to run
 * @param state - The GSD state to validate
 * @returns Aggregated validation results
 */
function runValidators(
  validators: ValidatorConfig[],
  state: GSDState,
): ValidationResults {
  const results: ValidationResult[] = [];
  let errors = 0;
  let warnings = 0;

  for (const validator of validators) {
    try {
      const result = validator.validate(state);
      const severity = validator.severity ?? "error";
      results.push({
        name: validator.name,
        valid: result.valid,
        message: result.message,
        severity,
      });

      if (!result.valid) {
        if (severity === "error") {
          errors++;
        } else {
          warnings++;
        }
      }
    } catch (error) {
      // If validator throws, treat as error
      results.push({
        name: validator.name,
        valid: false,
        message: `Validator threw error: ${error instanceof Error ? error.message : String(error)}`,
        severity: "error",
      });
      errors++;
    }
  }

  return {
    results,
    passed: errors === 0,
    errors,
    warnings,
  };
}

// ─── Middleware Factory ────────────────────────────────────────────────────

/**
 * Creates the validation middleware.
 *
 * This middleware validates the GSD state before dispatching a unit.
 * It runs configurable validators and can pause dispatch on validation errors.
 *
 * @param config - Optional configuration for the middleware
 * @param config.priority - Priority of the middleware (default: 98)
 * @param config.enabled - Whether the middleware is enabled (default: true)
 * @param config.name - Name of the middleware (default: "validation")
 * @param config.validators - Array of validators to run (default: DEFAULT_VALIDATORS)
 * @param config.onValidationError - How to handle errors: 'pause', 'continue', or 'throw'
 * @returns A DispatchMiddleware function
 *
 * @example
 * ```typescript
 * const middleware = createValidationMiddleware({
 *   validators: [
 *     { name: "customValidator", validate: (state) => ({ valid: true }) }
 *   ],
 *   onValidationError: "pause"
 * });
 * ```
 */
export function createValidationMiddleware(
  config?: Partial<ValidationConfig>,
): DispatchMiddleware {
  const priority = config?.priority ?? DEFAULT_PRIORITY;
  const enabled = config?.enabled ?? true;
  const name = config?.name ?? "validation";
  const validators = config?.validators ?? DEFAULT_VALIDATORS;
  const onValidationError = config?.onValidationError ?? "pause";

  // Return a no-op middleware if disabled
  if (!enabled) {
    return async () => {
      // Disabled middleware does nothing
    };
  }

  const middleware: DispatchMiddleware = async (context, next) => {
    // Get the current state
    const state = context.state;

    // Run all validators
    const validationResults = runValidators(validators, state);

    // Prepare validation metadata to include in decision
    const validationMetadata = {
      validationResults,
      validatorsRun: validators.map(v => v.name),
      timestamp: Date.now(),
    };

    // Handle validation results based on configuration
    if (!validationResults.passed) {
      // We have errors
      if (onValidationError === "throw") {
        const errorMessages = validationResults.results
          .filter(r => !r.valid && r.severity === "error")
          .map(r => `${r.name}: ${r.message ?? "Validation failed"}`)
          .join("\n");
        throw new Error(`Validation failed:\n${errorMessages}`);
      } else if (onValidationError === "pause") {
        // Set pause decision with validation metadata
        context.decision = {
          ...PAUSE_DECISION,
          metadata: {
            ...PAUSE_DECISION.metadata,
            ...validationMetadata,
          },
        };

        // Notify user about validation failure
        const errorResults = validationResults.results.filter(r => !r.valid && r.severity === "error");
        const messages = errorResults.map(r => `- ${r.name}: ${r.message ?? "Validation failed"}`).join("\n");
        context.ctx.ui.notify(
          `Validation failed. Pausing auto-mode.\n${messages}`,
          "warning",
        );

        // DO NOT call next() — we're making a decision to pause
        return;
      } else if (onValidationError === "continue") {
        // Continue but notify about errors
        const errorResults = validationResults.results.filter(r => !r.valid && r.severity === "error");
        const messages = errorResults.map(r => `- ${r.name}: ${r.message ?? "Validation failed"}`).join("\n");
        context.ctx.ui.notify(
          `Validation errors detected (continuing anyway):\n${messages}`,
          "warning",
        );
      }
    }

    // Notify about warnings (if any)
    const warningResults = validationResults.results.filter(r => !r.valid && r.severity === "warning");
    if (warningResults.length > 0) {
      const messages = warningResults.map(r => `- ${r.name}: ${r.message ?? "Validation warning"}`).join("\n");
      context.ctx.ui.notify(
        `Validation warnings:\n${messages}`,
        "info",
      );
    }

    // Store validation results in pending decision metadata if available
    if (context.pendingDecision) {
      context.pendingDecision.metadata = {
        ...context.pendingDecision.metadata,
        validation: validationMetadata,
      };
    }

    // Pass through to next middleware
    await next();
  };

  // Attach metadata for identification
  (middleware as DispatchMiddleware & { __metadata?: { name: string; priority: number } }).__metadata = {
    name,
    priority,
  };

  return middleware;
}
