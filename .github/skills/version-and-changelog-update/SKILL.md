---
name: version-and-changelog-update
description: 'Update app version metadata and the ChangeLog page for a branch. Use when you need to increment package.json version, increment dataSchemaVersion, sync generated schema version file, and add a 1-3 sentence summary of branch changes.'
argument-hint: 'Provide target version(s), bump type, and optional release date'
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
- App version target (or bump type: patch/minor/major/prerelease)
- Data schema version target (or bump strategy)
- Optional release date (defaults to today)
- Optional base branch for summary comparison (default: main)

## Procedure
1. Determine version targets.
- If explicit targets are provided, use them directly.
- If only bump type is provided, compute the next semantic version.
- If data schema bump is unspecified, increment the trailing schema segment and keep the existing format.

2. Gather branch change context for summary text.
- Inspect changed files and commits against the base branch.
- Extract 2-5 concrete highlights that affected behavior, UX, data, or reliability.
- Convert highlights into a neutral 1-3 sentence release summary.

3. Update version metadata in package.json.
- Set package.json version to the new app version.
- Set package.json dataSchemaVersion to the new schema version.

4. Sync generated schema version file.
- Run npm run sync:data-schema-version.
- Confirm src/app/generated/data-schema-version.ts matches package.json dataSchemaVersion.

5. Update ChangeLog page.
- Edit src/app/pages/changelog/changelog.html.
- Add a new top-most entry for the new version and date.
- Include exactly one summary paragraph with 1-3 sentences.
- Keep existing entries below it in reverse chronological order.

6. Validate.
- Run npm run check:data-schema-version.
- Verify all touched files are consistent and compile without new errors.

7. Report completion.
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
