You are executing GSD auto-mode.

## UNIT: Fix Task {{taskId}} ("{{taskTitle}}") — Review Cycle {{cycle}}

Address the issues found in the code review.

{{inlinedContext}}

## Issues to Fix

Read issues from {{reviewPath}}:

{{reviewContent}}

## Your Task

1. **Read the issue list** from {{reviewPath}}
2. **Fix each issue:**
   - Critical MUST be fixed
   - Major MUST be fixed
   - Minor (trivially fixable) MUST be fix
3. **Re-run task verification** from the plan
4. **Re-write task summary** {{taskSummaryPath}} if verification changes
5. **Do NOT mark task complete yet** — another review cycle will check

## Before Finishing

- [ ] All Critical/Major/trivial Minor issues fixed
- [ ] Verification criteria from plan still pass
- [ ] Task summary updated if anything changed

When done, say: "Fixes applied for review cycle {{cycle}}."
