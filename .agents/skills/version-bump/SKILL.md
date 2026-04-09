---
name: version-bump
description: 'Update app version metadata and the ChangeLog page for a branch. Use when you need to increment package.json version, increment dataSchemaVersion, sync generated schema version file, and add a 1-3 sentence summary of branch changes.'
argument-hint: 'Provide app bump intent (MAJOR/MINOR/BUGFIX/NONE), schema bump intent (YES/NO), and optional release date'
user-invocable: true
---

# Version And ChangeLog Update

## What This Skill Produces
- Updated version metadata in package.json:
  - version
  - dataSchemaVersion
- Synced generated schema version constant in src/app/generated/data-schema-version.ts
- New ChangeLog entry in src/app/pages/changelog/changelog.html with:
  - Version label
  - Date
  - A concise 1-3 sentence summary of branch changes

## When To Use
- Preparing a branch for release notes
- Updating app version and schema version together
- Keeping the in-app ChangeLog page aligned with version metadata

## Inputs
- App version update intent: MAJOR, MINOR, BUGFIX, or NONE
- Data schema version update intent: YES or NO
- Optional explicit app version target (overrides bump intent)
- Optional explicit data schema version target (overrides YES/NO behavior)
- Optional release date (defaults to today)
- Optional base branch for summary comparison (default: main)

## Procedure
1. Ask two required release questions first.
- Was there an app version update? (MAJOR/MINOR/BUGFIX/NONE)
- Was there a data schema version update? (YES/NO)

2. Determine version targets.
- If explicit targets are provided, use them directly.
- If app intent is MAJOR/MINOR/BUGFIX, compute the next semantic version accordingly.
- If app intent is NONE, keep the existing app version.
- If schema intent is YES and no explicit schema target is provided, increment the trailing schema segment and keep the existing format.
- If schema intent is NO, keep the existing data schema version unchanged.

3. Gather branch change context for summary text.
- Inspect changed files and commits against the base branch.
- Extract 2-5 concrete highlights that affected behavior, UX, data, or reliability.
- Convert highlights into a neutral 1-3 sentence release summary.

4. Update version metadata in package.json.
- Set package.json version to the new app version.
- Set package.json dataSchemaVersion to the new schema version.

5. Sync generated schema version file.
- Run npm run sync:data-schema-version.
- Confirm src/app/generated/data-schema-version.ts matches package.json dataSchemaVersion.

6. Update ChangeLog page.
- Edit src/app/pages/changelog/changelog.html.
- Add a new top-most entry for the new version and date.
- Include exactly one summary paragraph with 1-3 sentences.
- Keep existing entries below it in reverse chronological order.

7. Validate.
- Run npm run check:data-schema-version.
- Verify all touched files are consistent and compile without new errors.

8. Report completion.
- List updated files.
- Provide the exact version and data schema version values.
- Provide the final 1-3 sentence summary text that was added.

## Decision Rules
- If the requested app version is lower than current, stop and ask for confirmation.
- If schema format is ambiguous, preserve the current naming pattern and bump only the trailing numeric segment.
- If branch changes are too broad to summarize confidently, ask for one focus area before writing final summary text.

## Quality Criteria
- package.json version and dataSchemaVersion are both changed as requested.
- src/app/generated/data-schema-version.ts is synced to dataSchemaVersion.
- ChangeLog has a new entry at the top.
- Summary is factual, branch-specific, and 1-3 sentences.
- No unrelated files are modified.
