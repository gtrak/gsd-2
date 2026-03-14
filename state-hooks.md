# GSD State Hooks System Plan

## Overview

This document describes the extension system for the GSD state machine. It enables users to inject middleware that intercepts state transitions and alters behavior while maintaining full compatibility with existing GSD workflows.

## Implementation Status

- ✅ Phase 1: Core Infrastructure (4/4 tasks)
- ✅ Phase 2: Task Lifecycle Hook (6/6 tasks)
- ✅ Phase 3: Hook Integration (2/2 tasks)
- ✅ Phase 4: Configuration (3/3 tasks)
- ✅ Phase 5: Hook Loader & Documentation
- ✅ Phase 6: Middleware State Machine Refactor (12/12 tasks - COMPLETED)
- ⏳ Phase 7: Consolidation & Extension API (not started)

**Key Principles:**
- Hooks are middleware that intercept `/gsd next` flow
- Hook state lives in `GSDState.extensions`, persisted to task/slice/milestone markdown frontmatter
- Single source of truth: all state in existing `.gsd/` structure
- Self-recovering: hooks check filesystem artifacts to determine current state
- HTTP middleware pattern: chain of responsibility with `next()` continuation

---

## Core Abstractions

### 1. Extensible GSDState ✅ IMPLEMENTED

**File:** `src/resources/extensions/gsd/types.ts`

**Changes:**
```typescript
export interface GSDState {
  // ... existing fields ...
  
  // Extension point - hooks store typed data here
  extensions: {
    [hookName: string]: unknown;
  };
}
```

**Rationale:** Provides type-safe extension point without breaking existing code.

### 2. Hook Middleware Interface ✅ IMPLEMENTED

**File:** `src/resources/extensions/gsd/hooks.ts` (new)

```typescript
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

export type GSDMiddleware = (
  context: HookContext,
  next: () => Promise<void>
) => Promise<void>;

export interface HookRegistration {
  name: string;
  middleware: GSDMiddleware;
  priority?: number; // 0-100, default 50
}
```

### 3. Hook Registry ✅ IMPLEMENTED

**File:** `src/resources/extensions/gsd/hooks.ts`

```typescript
// Singleton registry
const hookRegistry = new Map<string, HookRegistration>();

// Registration API
export function registerHook(registration: HookRegistration): void;

// Internal execution (called by auto.ts)
export async function executeMiddlewareChain(
  state: GSDState,
  context: Omit<HookContext, 'workingState' | 'getExtensionData' | 'setExtensionData'>
): Promise<HookContext>;

// Priority-sorted hook list
export function getRegisteredHooks(): HookRegistration[];
```

### 4. State Derivation with Extensions ✅ IMPLEMENTED

**File:** `src/resources/extensions/gsd/state.ts`

**Changes to `deriveState()`:**
- Parse `extensions` field from YAML frontmatter of:
  - Task SUMMARY.md files
  - Slice PLAN.md and SUMMARY.md files  
  - Milestone ROADMAP.md and SUMMARY.md files
- Merge extension data hierarchically: milestone → slice → task
- Store merged result in `GSDState.extensions`

**New function:**
```typescript
export function mergeExtensionData(
  milestoneData: Record<string, unknown>,
  sliceData: Record<string, unknown>,
  taskData: Record<string, unknown>
): Record<string, unknown>;
```

### 5. Middleware Integration in Dispatch ✅ IMPLEMENTED

**File:** `src/resources/extensions/gsd/auto.ts`

**Changes to `dispatchNextUnit()`:**
```typescript
async function dispatchNextUnit(
  ctx: ExtensionContext,
  pi: ExtensionAPI
): Promise<void> {
  if (!active || !cmdCtx) return;
  
  const state = await deriveState(basePath);
  
  // Execute middleware chain
  const middlewareContext = await executeMiddlewareChain(state, {
    basePath,
    pi,
    ctx,
    state,
  });
  
  // Check if any hook made a decision
  if (middlewareContext.decision) {
    const { unitType, unitId, prompt } = middlewareContext.decision;
    
    // Persist any state changes made by hooks
    if (middlewareContext.workingState !== state) {
      await persistGSDState(basePath, middlewareContext.workingState);
    }
    
    // Dispatch hook's chosen unit
    await dispatchUnit(unitType, unitId, prompt, ctx, pi);
    return;
  }
  
  // ... existing default dispatch logic ...
}
```

**New function:**
```typescript
async function dispatchUnit(
  unitType: string,
  unitId: string,
  prompt: string,
  ctx: ExtensionContext,
  pi: ExtensionAPI
): Promise<void>;
```

### 6. State Persistence ✅ IMPLEMENTED

**File:** `src/resources/extensions/gsd/files.ts`

**New functions:**
```typescript
// Persist extension data back to appropriate markdown file
export async function persistExtensionData(
  basePath: string,
  milestoneId: string,
  sliceId: string | null,
  taskId: string | null,
  extensions: Record<string, unknown>
): Promise<void>;

// Parse extensions from frontmatter
export function parseExtensions(frontmatter: string): Record<string, unknown>;

// Serialize extensions to YAML
export function serializeExtensions(extensions: Record<string, unknown>): string;
```

### 7. Preferences Integration ✅ IMPLEMENTED

**File:** `src/resources/extensions/gsd/preferences.ts`

**Changes:**
Add to `GSDPreferences` interface:
```typescript
export interface GSDPreferences {
  // ... existing fields ...
  
  hooks?: {
    enabled?: Array<{
      name: string;
      priority?: number;
      config?: Record<string, unknown>;
    }>;
    disabled?: string[];
  };
}
```

**New function:**
```typescript
export function loadEnabledHooks(preferences: GSDPreferences): HookConfig[];
```

---

## Distribution & Registration

### Pi Extension Pattern

Hooks are distributed as standard Pi extensions:

**Directory structure:**
```
~/.gsd/agent/extensions/my-review-loop/
├── index.ts          # Pi extension entry point
└── gsd-hooks.ts      # Hook implementation
```

**index.ts:**
```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerHook } from "../gsd/hooks.js";
import { reviewLoopMiddleware } from "./gsd-hooks.js";

export default function (pi: ExtensionAPI) {
  registerHook({
    name: "review-loop",
    middleware: reviewLoopMiddleware,
    priority: 50,
  });
}
```

**Configuration in preferences.md:**
```yaml
gsd_hooks:
  enabled:
    - name: review-loop
      priority: 50
      config:
        max_cycles: 5
```

### Auto-Discovery

On startup, the GSD extension:
1. Loads preferences to get `enabled` hook list
2. For each enabled hook, checks if already registered by Pi
3. If not registered, logs warning but continues
4. Sorts registered hooks by priority (higher = earlier)

---

## Test Plan

### Test Category 1: Core Hook Infrastructure

**File:** `src/resources/extensions/gsd/tests/hooks-registry.test.ts`

| Test | Description |
|------|-------------|
| `registerHook adds to registry` | Verify hook is stored in registry map |
| `registerHook deduplicates by name` | Later registration overwrites earlier |
| `getRegisteredHooks sorts by priority` | Returns hooks in priority order (high to low) |
| `getRegisteredHooks returns empty array when no hooks` | Edge case handling |

### Test Category 2: Hook Execution

**File:** `src/resources/extensions/gsd/tests/hooks-execution.test.ts`

| Test | Description |
|------|-------------|
| `executeMiddlewareChain calls hooks in order` | Verifies sequential execution |
| `hook can modify workingState` | State changes are captured |
| `hook can set decision to override dispatch` | Decision flows back to caller |
| `next() continues to next hook` | Middleware chain progresses |
| `early return skips remaining hooks` | Short-circuit behavior |
| `all hooks called even if one errors` | Error isolation |
| `context helpers work` | getExtensionData/setExtensionData function |

### Test Category 3: State Derivation with Extensions

**File:** `src/resources/extensions/gsd/tests/derive-state-extensions.test.ts`

| Test | Description |
|------|-------------|
| `deriveState parses extensions from task SUMMARY.md` | Reads YAML frontmatter extensions field |
| `deriveState merges hierarchical extension data` | milestone + slice + task = merged |
| `task data overrides slice data` | Proper merge precedence |
| `slice data overrides milestone data` | Proper merge precedence |
| `deriveState handles missing extensions field` | Backwards compatibility |
| `deriveState handles malformed extensions` | Graceful error handling |

### Test Category 4: State Persistence

**File:** `src/resources/extensions/gsd/tests/persist-extensions.test.ts`

| Test | Description |
|------|-------------|
| `persistExtensionData writes to task file` | Task-level extensions persisted |
| `persistExtensionData writes to slice file` | Slice-level extensions persisted |
| `persistExtensionData writes to milestone file` | Milestone-level extensions persisted |
| `persistExtensionData merges with existing frontmatter` | Preserves other fields |
| `parseExtensions extracts data from YAML` | Correct parsing |
| `serializeExtensions produces valid YAML` | Round-trip consistency |

### Test Category 5: Integration with Dispatch

**File:** `src/resources/extensions/gsd/tests/hooks-dispatch-integration.test.ts`

| Test | Description |
|------|-------------|
| `dispatchNextUnit calls middleware chain` | Integration point works |
| `hook decision overrides default dispatch` | Custom unit dispatched |
| `no decision falls through to default logic` | Existing behavior preserved |
| `workingState changes persisted before dispatch` | State consistency |
| `dispatch works with multiple hooks` | Composition works |

### Test Category 6: Review Loop Example

**File:** `src/resources/extensions/gsd/tests/hooks-review-loop.test.ts`

| Test | Description |
|------|-------------|
| `review loop initializes on task completion` | Extensions data created |
| `review loop dispatches review-task` | Override decision made |
| `review loop parses CODE-REVIEW.md` | Reads review output |
| `review loop dispatches fix-task on issues found` | Cycle continues |
| `review loop increments cycle counter` | Iteration tracking |
| `review loop max cycles enforcement` | Stops after configured limit |
| `review loop clears on pass` | Allows normal completion |
| `review loop recovers from crash during review` | Re-dispatches review |
| `review loop recovers from crash during fix` | Re-dispatches fix |
| `review loop handles missing CODE-REVIEW.md` | Recovery logic |

### Test Category 7: Preferences Integration

**File:** `src/resources/extensions/gsd/tests/hooks-preferences.test.ts`

| Test | Description |
|------|-------------|
| `loadEnabledHooks reads from preferences` | Config parsing |
| `loadEnabledHooks uses default priority` | Default values |
| `loadEnabledHooks handles missing hooks config` | Backwards compatibility |
| `hooks respect priority ordering` | Config priority applied |

---

## Implementation Phases

### Phase 1: Core Infrastructure
1. Add `extensions` field to `GSDState` interface
2. Create `hooks.ts` with registry and execution
3. Implement `executeMiddlewareChain`
4. Write registry and execution tests

### Phase 2: State Integration
1. Update `deriveState` to parse extensions
2. Implement `mergeExtensionData`
3. Create persistence functions in `files.ts`
4. Write derivation and persistence tests

### Phase 3: Dispatch Integration
1. Modify `dispatchNextUnit` to call middleware
2. Implement `dispatchUnit` helper
3. Write dispatch integration tests

### Phase 4: Preferences & Distribution
1. Add hooks config to preferences
2. Implement `loadEnabledHooks`
3. Write preferences tests
4. Create example hook documentation

### Phase 5: Review Loop Example
1. Implement review-loop as example hook
2. Write comprehensive review-loop tests
3. Document self-recovery patterns

### Phase 6: Middleware State Machine Refactor ✅ COMPLETED
Replaced inline dispatch logic with composable middleware chain.

**Deliverables:**
1. **Shared Types** (`middleware/types.ts`): DispatchContext, DispatchDecision, MiddlewareConfig
2. **Eight Middlewares:**
   - IdempotencyMiddleware (priority 100) - skip completed units
   - BudgetCeilingMiddleware (priority 95) - pause on budget exceeded
   - MergeGuardMiddleware (priority 90) - merge done slices before continuing
   - UatDispatchMiddleware (priority 85) - dispatch UAT after merge
   - ReassessmentMiddleware (priority 80) - adaptive replanning
   - PhaseDispatchMiddleware (priority 75) - main phase-based dispatch
   - CodeReviewMiddleware (priority 70) - review/fix cycle
   - ObservabilityMiddleware (priority 60) - emit warnings
3. **Compose Functions** (`middleware/index.ts`): composeDispatchMiddlewares(), composeDispatchMiddlewaresWithConfig()
4. **Integration** (`auto.ts`): executeDispatchMiddlewares() orchestrates the chain
5. **Tests**: 150+ assertions across all middlewares and integration tests

**Files Created:**
- `src/resources/extensions/gsd/middleware/` (9 files)
- `src/resources/extensions/gsd/tests/*-middleware.test.ts` (8 test files)
- `src/resources/extensions/gsd/tests/middleware-integration.test.ts`

### Phase 7: Consolidation & Extension API
Consolidate the two hook systems and expose middleware API to extension authors.

**Goals:**
1. **Unify Hook Systems**
   - Merge original executeMiddlewareChain with new dispatch middlewares
   - Single registration API: registerDispatchMiddleware()
   - Two execution phases: pre-dispatch hooks, dispatch decision

2. **Configuration via Preferences**
   ```yaml
   gsd:
     middleware:
       enabled:
         - name: budget-ceiling
           priority: 95
         - name: code-review
           priority: 70
       disabled:
         - merge-guard
   ```

3. **Extension Author API**
   ```typescript
   // Extension authors can register middleware
   registerDispatchMiddleware({
     name: 'my-custom-check',
     priority: 85,
     middleware: async (ctx, next) => { ... }
   });
   ```

4. **Documentation**
   - How to write a middleware
   - Priority guidelines (100=first, 60=last)
   - Testing patterns
   - Decision types and special handling

5. **Additional Middlewares**
   - MetricsMiddleware - track before/after dispatch
   - NotificationsMiddleware - send notifications
   - ValidationMiddleware - validate state before dispatch

**Success Criteria:**
- [ ] Single unified middleware registration system
- [ ] Middlewares configurable via preferences.md
- [ ] Extension authors can register custom middlewares
- [ ] Documentation complete with examples
- [ ] All existing tests pass
- [ ] 90%+ test coverage on middleware system


---

## Self-Recovery Patterns

Hooks must handle crashes at any point. Pattern:

```typescript
export const reviewLoopMiddleware: GSDMiddleware = async (ctx, next) => {
  const reviewState = ctx.getExtensionData<ReviewLoopState>('review-loop');
  
  if (!reviewState?.activeReview) {
    await next();
    return;
  }
  
  const { taskId, status, cycle } = reviewState.activeReview;
  
  // Recovery: Check what actually exists on disk
  if (status === 'pending_review') {
    const reviewPath = ctx.resolveTaskFile(`${taskId}-CODE-REVIEW.md`);
    
    if (!reviewPath || !existsSync(reviewPath)) {
      // Crash during review - re-dispatch
      ctx.decision = { unitType: 'review-task', ... };
      return;
    }
    
    // Review completed - parse and continue
    const issues = parseCodeReview(reviewPath);
    // ... handle result
  }
  
  if (status === 'fixing') {
    // Check if fix was written
    const fixComplete = checkFixCompletion(ctx.basePath, taskId);
    
    if (!fixComplete) {
      // Crash during fix - re-dispatch
      ctx.decision = { unitType: 'fix-task', ... };
      return;
    }
    
    // Fix completed - move to next review cycle
    ctx.setExtensionData('review-loop', {
      ...reviewState,
      activeReview: {
        ...reviewState.activeReview,
        status: 'pending_review',
        cycle: cycle + 1
      }
    });
    
    ctx.decision = { unitType: 'review-task', ... };
    return;
  }
  
  await next();
};
```

**Key Recovery Principle:** Always check filesystem state before assuming in-memory state is correct.

---

## Migration from Existing Code Review

The existing `code-review.ts` will be:
1. **Deprecated** but kept for reference
2. **Migrated** to use hook pattern
3. **Removed** after hook system stabilizes

Migration path:
1. Implement hook system
2. Convert code-review to hook-based implementation
3. Remove hardcoded code-review logic from `auto.ts`
4. Remove `code-review.ts`

---

## Success Criteria

- [ ] All existing tests pass
- [ ] New test files achieve 90%+ coverage
- [ ] Review loop can be implemented purely as hook
- [ ] No separate state files created
- [ ] Self-recovery works in all crash scenarios
- [ ] Backwards compatible (extensions field optional)
- [ ] Documentation complete

### Phase 8: Pipeline Stages Refactor (PRIORITY REPLACEMENT)

**Status:** ⏳ Not Started  
**Goal:** Replace magic priority numbers with named pipeline stages  
**Motivation:** The current priority system (0-100) creates "spooky action at a distance" - middleware authors must understand all other middlewares' priorities to place their code correctly. Named stages make intent explicit and local.

#### Design Overview

Replace `priority: number` with `stage: PipelineStage` where stages represent semantic phases of the dispatch flow:

```typescript
type PipelineStage = 
  | 'pre-validation'    // Initial checks (idempotency)
  | 'validation'        // State validation
  | 'pre-dispatch'      // Guards (budget, merge)
  | 'dispatch'          // Core dispatch logic
  | 'post-dispatch'     // After-effects (review, metrics, observability)
  | 'notification';     // Final notifications
```

#### Execution Flow

```
pre-validation → validation → pre-dispatch → dispatch → post-dispatch → notification
     ↓               ↓              ↓            ↓             ↓               ↓
 idempotency    validation   budget-ceiling  uat-dispatch  code-review  notifications
                              merge-guard   reassessment  metrics
                              custom        phase-dispatch observability
                                            custom
```

#### Task P8.1: Define PipelineStage Type

**Files:** `middleware/types.ts`

**Work:**
1. Define `PipelineStage` union type with 6 named stages
2. Update `MiddlewareConfig` interface:
   - Remove `priority: number`
   - Add `stage: PipelineStage`
3. Update `DispatchMiddlewareRegistration` interface:
   - Remove `priority: number`
   - Add `stage: PipelineStage`

**Test:** Update existing type tests to use stage-based configs

#### Task P8.2: Update Built-in Middleware Factories

**Files:** `middleware/*.ts` (11 middleware files)

**Work (per middleware):**
1. Replace `priority` parameter with `stage` constant in factory
2. Update factory signature to accept stage override
3. Export stage constant (e.g., `IDEMPOTENCY_STAGE = 'pre-validation'`)

**Built-in Mapping:**
| Middleware | Stage |
|------------|-------|
| idempotency | pre-validation |
| validation | validation |
| budget-ceiling | pre-dispatch |
| merge-guard | pre-dispatch |
| uat-dispatch | dispatch |
| reassessment | dispatch |
| phase-dispatch | dispatch |
| code-review | post-dispatch |
| metrics | post-dispatch |
| observability | post-dispatch |
| notifications | notification |

**Test:** Ensure each factory returns middleware with correct stage metadata

#### Task P8.3: Rewrite Compose Functions for Stages

**Files:** `middleware/index.ts`

**Work:**
1. **Remove priority sorting** - delete all sort-by-priority logic
2. **Remove `__metadata` attachment** - no longer needed
3. **Rewrite `composeDispatchMiddlewares()`**:
   - Group middlewares by stage into fixed order
   - Within each stage, preserve built-in order (no custom sorting needed)
   - Custom middlewares append to their stage in registration order
4. **Rewrite `composeDispatchMiddlewaresWithConfig()`**:
   - Same pattern: group by stage, fixed stage order
5. **Rewrite `composeDispatchMiddlewaresWithPreferences()`**:
   - Change from priority override to stage assignment
   - Custom middlewares can specify stage in preferences
6. **Remove `DEFAULT_MIDDLEWARE_PRIORITIES`** constant

**Execution Order Implementation:**
```typescript
const STAGE_ORDER: PipelineStage[] = [
  'pre-validation',
  'validation',
  'pre-dispatch',
  'dispatch',
  'post-dispatch',
  'notification'
];

function groupByStage(middlewares: Middleware[]): Map<PipelineStage, Middleware[]> {
  // Group by stage, preserving registration order within stage
}
```

**Test:** 50+ assertions testing stage-based ordering

#### Task P8.4: Update Custom Middleware Registration

**Files:** `middleware/index.ts`, `hooks.ts`

**Work:**
1. Update `registerDispatchMiddleware()` signature:
   ```typescript
   registerDispatchMiddleware({
     name: 'my-custom-guard',
     stage: 'pre-dispatch',  // Explicit intent, not magic numbers
     middleware: myGuard
   });
   ```
2. Update `dispatchMiddlewareRegistry` to index by stage
3. Update `getRegisteredDispatchMiddlewares()` to return stage-grouped results
4. Deprecate `registerHook()` in hooks.ts (already deprecated, ensure warning mentions stages)

**Test:** Update registry tests for stage-based registration

#### Task P8.5: Update Preferences Loading

**Files:** `preferences.ts`, `middleware/index.ts`

**Work:**
1. Update `MiddlewarePreferences` interface:
   ```typescript
   interface MiddlewarePreferences {
     enabled?: Array<{
       name: string;
       stage?: PipelineStage;  // Can override default stage
       config?: Record<string, unknown>;
     }>;
     disabled?: string[];
   }
   ```
2. Update `loadMiddlewareConfig()` to read stage assignments
3. Update `composeDispatchMiddlewaresWithPreferences()` to use stage from config

**Preferences Example:**
```yaml
gsd:
  middleware:
    enabled:
      - name: budget-ceiling
        stage: pre-dispatch
      - name: my-custom-guard
        stage: pre-dispatch
    disabled:
      - uat-dispatch
```

**Test:** Update preferences tests for stage-based configuration

#### Task P8.6: Update Auto.ts Integration

**Files:** `auto.ts`

**Work:**
1. Update any hardcoded priority references to use stages
2. Ensure `composeDispatchMiddlewaresWithPreferences()` integration still works
3. Verify extension data loading happens at correct stage

**Test:** Update integration tests, verify dispatch flow unchanged

#### Task P8.7: Update Extension Author API

**Files:** `index.ts`

**Work:**
1. Export `PipelineStage` type for extension authors
2. Update API documentation examples to use stages
3. Ensure backwards compatibility (old registerHook deprecated but still works)

**Example for extension authors:**
```typescript
import { registerDispatchMiddleware, PipelineStage } from '@gsd/core';

registerDispatchMiddleware({
  name: 'my-logger',
  stage: 'post-dispatch' as PipelineStage,
  middleware: async (ctx, next) => {
    console.log('Before dispatch');
    await next();
    console.log('After dispatch');
  }
});
```

**Test:** Update extension API tests for stage-based registration

#### Task P8.8: Update All Existing Tests

**Files:** All `tests/*-middleware.test.ts`, `tests/middleware-*.test.ts`

**Work:**
1. Replace all `priority` values with `stage` values
2. Replace priority-based assertions with stage-based assertions
3. Remove tests that verify priority sorting (replace with stage ordering tests)
4. Update test descriptions to reference stages

**Test Files to Update:**
- `middleware-registry.test.ts` - 54+ tests
- `middleware-preferences.test.ts` - 60+ tests
- `middleware-integration.test.ts` - 50+ tests
- `auto-middleware-integration.test.ts` - 54+ tests
- `extension-api.test.ts` - 41 tests
- `metrics-middleware.test.ts` - 31 tests
- `notifications-middleware.test.ts` - 35 tests
- `validation-middleware.test.ts` - 31 tests
- All 11 individual middleware test files

#### Task P8.9: Documentation Update

**Files:** `README.md` or create `middleware/README.md`

**Work:**
1. Document the 6 pipeline stages and their purposes
2. Document which built-in middlewares run at which stage
3. Document how extension authors choose a stage
4. Document stage execution order with visual diagram
5. Update all code examples to use `stage` instead of `priority`
6. Add migration guide from priority to stages

**Documentation Sections:**
- "Understanding Pipeline Stages"
- "Choosing the Right Stage for Your Middleware"
- "Built-in Middleware Reference" (with stages)
- "Configuration via Preferences" (stage-based)
- "Migration from Priority Numbers"

#### Success Criteria

- [ ] All priority numbers removed from codebase
- [ ] PipelineStage type defined with 6 stages
- [ ] All 11 built-in middlewares declare their stage
- [ ] Compose functions use stage-based ordering
- [ ] Custom middleware registration uses stage
- [ ] Preferences loading supports stage assignment
- [ ] Extension API exports PipelineStage type
- [ ] All 350+ tests updated and passing
- [ ] Documentation updated with stage-based examples
- [ ] No breaking changes to runtime behavior (just API)
- [ ] Migration guide provided for existing extensions

#### Rollback Plan

If issues arise:
1. Branch: `git checkout -b pipeline-stages-backup`
2. Each task is independent - can revert individual files
3. Priority system can be restored by reverting P8.1-P8.5
4. Tests serve as regression safety net

---
