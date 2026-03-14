
---

## Phase 9: Cleanup and Hardening (REMOVE BACKWARD COMPATIBILITY)

**Status:** ⏳ Not Started  
**Goal:** Remove all backward compatibility code and legacy systems to achieve a clean, tight interface  
**Philosophy:** "It's better to have a tight interface and expand it later than to ship complexity and try to walk it back."

### Current Technical Debt

The codebase contains legacy systems and backward compatibility layers that complicate the architecture:

1. **hooks.ts** - Entire deprecated hook system still in use
   - `registerHook()` / `getRegisteredHooks()` / `executeMiddlewareChain()`
   - Still actively used in `auto.ts` lines 1467-1563
   - Duplicates what dispatch middleware system does
   - 186 lines of code

2. **Old decision handling in auto.ts**
   - `SKIP_DECISION` handling (idempotency middleware)
   - `PAUSE_DECISION` handling (budget-ceiling middleware)  
   - `MERGE_ERROR_DECISION` handling (merge-guard middleware)
   - These are now handled by the middleware chain itself, but auto.ts still has legacy checks

3. **TaskLifecycleHook**
   - Registered via old hook system in auto.ts
   - Should become a proper dispatch middleware

4. **Extension API surface bloat**
   - Multiple compose functions could be unified
   - Unused exports from index.ts

### Task P9.1: Migrate TaskLifecycleHook to Dispatch Middleware

**Status:** ⏳ Not Started  
**Complexity:** Medium  
**Files:** 
- `src/resources/extensions/gsd/task-lifecycle-hook.ts`
- `src/resources/extensions/gsd/auto.ts`

**Work:**
1. Convert `TaskLifecycleHook` class to middleware factory function
2. Register it via `registerDispatchMiddleware()` instead of `registerHook()`
3. Choose appropriate stage (likely 'dispatch' or 'pre-dispatch')
4. Update auto.ts to remove hook registration call
5. Update any tests

**Test:** Ensure lifecycle tracking still works after migration

---

### Task P9.2: Remove Legacy Hook System

**Status:** ⏳ Not Started  
**Complexity:** High (requires P9.1 completion)  
**Files:**
- `src/resources/extensions/gsd/hooks.ts` - DELETE ENTIRE FILE (186 lines)
- `src/resources/extensions/gsd/index.ts` - Remove HookContext export
- `src/resources/extensions/gsd/middleware/types.ts` - Remove GSDMiddleware import/re-export
- `src/resources/extensions/gsd/auto.ts` - Remove executeMiddlewareChain call
- `src/resources/extensions/gsd/tests/hooks.test.ts` - DELETE
- `src/resources/extensions/gsd/tests/extension-api.test.ts` - Remove hook tests
- `src/resources/extensions/gsd/preferences.ts` - Remove HooksPreferences type

**Work:**
1. Ensure P9.1 is complete (no more hook usage)
2. Delete hooks.ts
3. Remove all imports/references to hooks.ts
4. Update type exports
5. Delete or update tests that use hooks

**Acceptance Criteria:**
- [ ] hooks.ts file deleted
- [ ] No references to registerHook, getRegisteredHooks, executeMiddlewareChain
- [ ] GSDMiddleware type moved to middleware/types.ts (not re-exported from hooks)
- [ ] All tests pass
- [ ] TypeScript compiles without errors

**Test:** All existing tests must pass after removal

---

### Task P9.3: Clean Up auto.ts Decision Handling

**Status:** ⏳ Not Started  
**Complexity:** Medium  
**Files:** `src/resources/extensions/gsd/auto.ts`

**Current Problem:** auto.ts has two decision handling paths:
1. **New middleware chain** (lines 1477-1556) - handles decisions via `dispatchContext.decision`
2. **Legacy hook chain** (lines 1563-1580) - calls executeMiddlewareChain

The decision constants (SKIP_DECISION, PAUSE_DECISION, MERGE_ERROR_DECISION) are still being checked in auto.ts even though middleware chain handles them.

**Work:**
1. After P9.2 removes hooks, verify middleware chain fully handles all decision types
2. Remove duplicate decision handling logic in auto.ts
3. Ensure idempotency, budget-ceiling, merge-guard middlewares properly set decisions
4. Update auto.ts to trust middleware chain results

**Acceptance Criteria:**
- [ ] No duplicate decision handling in auto.ts
- [ ] Middleware chain is single source of truth
- [ ] All decision types work correctly (skip, pause, error, custom)
- [ ] All tests pass

---

### Task P9.4: Unify Compose Functions

**Status:** ⏳ Not Started  
**Complexity:** Medium  
**Files:** `src/resources/extensions/gsd/middleware/index.ts`

**Current Problem:** Two compose functions:
- `composeDispatchMiddlewares()` - returns all built-in middlewares
- `composeDispatchMiddlewaresWithPreferences()` - applies preferences

These can be unified into one function with optional preferences parameter.

**Work:**
1. Merge composeDispatchMiddlewares and composeDispatchMiddlewaresWithPreferences
2. Create single function: `composeDispatchMiddlewares(prefs?: GSDPreferences)`
3. If no prefs, use defaults; if prefs, apply them
4. Update all call sites
5. Remove deprecated function export

**Code Change:**
```typescript
// Before:
export function composeDispatchMiddlewares(): DispatchMiddleware[] { ... }
export function composeDispatchMiddlewaresWithPreferences(prefs: GSDPreferences): DispatchMiddleware[] { ... }

// After:
export function composeDispatchMiddlewares(prefs?: GSDPreferences): DispatchMiddleware[] {
  if (!prefs?.middleware) {
    // Return all built-in middlewares with default stages
  }
  // Apply preferences
}
```

**Lines saved:** ~80 lines

**Test:** Update any tests that call the removed function

---

### Task P9.5: Remove Unnecessary Type Exports

**Status:** ⏳ Not Started  
**Complexity:** Low  
**Files:** `src/resources/extensions/gsd/index.ts`

**Current Problem:** May be exporting types/functions that aren't needed by extension authors.

**Work:**
1. Audit all exports from index.ts
2. Remove any that are only used internally
3. Keep only what's needed for extension author API:
   - registerDispatchMiddleware
   - PipelineStage
   - MiddlewareConfig
   - DispatchMiddleware
   - composeDispatchMiddlewares

**Acceptance Criteria:**
- [ ] Minimal public API surface
- [ ] All internal functions kept internal
- [ ] Extension authors can do everything they need

---

### Task P9.6: Consolidate Stage Sorting Logic

**Status:** ⏳ Not Started  
**Complexity:** Low  
**Files:** `src/resources/extensions/gsd/middleware/index.ts`

**Current Problem:** Stage sorting logic duplicated in multiple functions:
- composeDispatchMiddlewares
- composeDispatchMiddlewaresWithPreferences

**Work:**
1. Extract `sortByStage()` helper function
2. Use in both compose functions
3. Single source of truth for ordering

**Lines saved:** ~8 lines

---

### Success Criteria for Phase 9

- [ ] TaskLifecycleHook migrated to dispatch middleware
- [ ] hooks.ts completely removed (186 lines deleted)
- [ ] No backward compatibility code remaining
- [ ] Single compose function (unified)
- [ ] Minimal public API exports
- [ ] All 2000+ tests passing
- [ ] Code coverage maintained or improved
- [ ] TypeScript compiles with zero errors
- [ ] No regression in functionality

### Total Lines to Remove

| Task | Lines |
|------|-------|
| P9.1 - Migrate TaskLifecycleHook | N/A (refactor) |
| P9.2 - Remove hooks.ts | 186 |
| P9.3 - Clean auto.ts | ~50 |
| P9.4 - Unify compose functions | ~80 |
| P9.5 - Remove exports | ~5 |
| P9.6 - Consolidate sorting | ~8 |
| **Total** | **~330 lines** |

### Order of Operations

```
P9.1 (Migrate TaskLifecycleHook)
    ↓
P9.2 (Remove hooks.ts)
    ↓
P9.3 (Clean auto.ts)
    ↓
P9.4, P9.5, P9.6 (Can be done in parallel)
    ↓
Final verification and commit
```

### Notes for Next Session

**Starting Point:** Branch `gsd-state` at commit `03bc111`

**Key Files to Modify:**
- `src/resources/extensions/gsd/task-lifecycle-hook.ts` - Convert to middleware
- `src/resources/extensions/gsd/hooks.ts` - Delete after migration
- `src/resources/extensions/gsd/auto.ts` - Remove legacy code
- `src/resources/extensions/gsd/middleware/index.ts` - Unify compose functions
- `src/resources/extensions/gsd/index.ts` - Clean exports

**Testing Strategy:**
After each task, run:
```bash
npm test -- src/resources/extensions/gsd/tests/middleware-*.test.ts
npm test -- src/resources/extensions/gsd/tests/extension-api.test.ts
npm test -- src/resources/extensions/gsd/tests/auto-middleware-integration.test.ts
```

**Philosophy Reminder:**
> "It's better to have a tight interface and expand it later than to ship complexity and try to walk it back."
> 
> Remove backward compatibility. Make it clean. Make it tight.
