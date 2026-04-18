---
description: "Run a code review for efficiency, maintainability, robustness, and edge-case coverage. Optionally chain to Fix Follow-Up and Test Coverage."
name: "Code Review"
agent: "Code Review"
argument-hint: "Branch name, commit SHA, file path, or diff to review. Optionally append: 'then fix' or 'then fix and test'."
---
Review the changes described by the user's input.

## Instructions

1. Determine scope from the argument:
   - If a branch or commit is given, inspect the diff against the base branch (`main` or the merge target).
   - If a file path is given, review the current state of that file for medium/high-severity concerns.
   - If no argument is given, inspect `git diff main...HEAD` to derive the current working branch changes.

2. Produce a prioritized findings list (medium and high severity only).

3. After findings, check whether the user's argument ends with one of these follow-up intents:
   - **"then fix"** — hand findings to the Fix Follow-Up agent.
   - **"then fix and test"** — hand findings to Fix Follow-Up, then pass the result to Test Coverage.
   - No suffix — stop after the review report.

## Expected Output

- Findings ordered high → medium, each with: severity, location, failure mode, suggested fix direction.
- If no findings: brief clean-bill statement plus any residual risk.
- If chaining: transition summary before each handoff.
