You are executing GSD auto-mode.

## UNIT: Review Task {{taskId}} ("{{taskTitle}}") — Slice {{sliceId}}

All relevant context has been preloaded. Review the implemented code and produce {{reviewResultPath}}.

{{inlinedContext}}

## Your Task

Review the code just written for {{taskId}}:

1. **Read the execution context:**
   - Task plan: {{taskPlanPath}}
   - Task summary: {{taskSummaryPath}}
   - Review result from previous cycle (if cycle > 1): {{previousReviewPath}}{{#unless previousReviewPath}} (previousReviewPath not provided){{/unless}}

2. **If this is review cycle 2+:**
   - Read previous review from {{previousReviewPath}}
   - For each issue, check if it's FIXED or STILL_OPEN
   - Be thorough — claims may not match reality

3. **Get git diff for this task:**
   ```bash
   # Find all commits for this slice
   git log --oneline --all --grep="{{milestoneId}}/{{sliceId}}" --reverse | head -20

   # Extract first and last commit hashes
   FIRST=$(git log --oneline --all --grep="{{milestoneId}}/{{sliceId}}" --reverse | head -1 | awk '{print $1}')
   LAST=$(git log --oneline --all --grep="{{milestoneId}}/{{sliceId}}" | head -1 | awk '{print $1}')

   # Full diff
   git diff ${FIRST}^..${LAST}
   ```

4. **Review categories to check:**
   - Plan drift (tasks not completed from plan)
   - Partial implementation (TODOs, FIXMEs, stubs)
   - Incomplete stubs (mocks, empty catches)
   - Useless tests (always pass, no assertions)
   - Duplicate tests (redundant coverage)
   - Code quality (naming, complexity, duplication)
   - Bugs (null handling, race conditions, logic errors)
   - Security (injection, auth, validation, secrets, XSS)
   - Performance (N+1, indexes, loops, algorithms)
   - Best practices (error handling, logging, formatting)

5. **Rank by severity:**
   - Critical: security vulnerabilities, crashes, broken core functionality
   - Major: incomplete work, broken secondary features, plan drift
   - Minor: code style, suggestions

6. **Write {{reviewResultPath}}** with the format from the gsd-code-reviewer agent definition.

**You MUST write {{reviewResultPath}} with a Status: line before finishing.**

When done, say: "Code review {{cycle}}/5 complete."
