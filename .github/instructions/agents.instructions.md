---
name: AI Agent Guidelines
applyTo: "**/*"
description: Concise, project-specific rules for AI coding agents working in this repo
---

# AI Agent Guidelines — obsidian-plugin-template

This short guide contains focused rules and examples to help AI coding agents make safe, high-quality changes quickly.

- Read `AGENTS.md` first; it contains higher-level policies and workflows.
- Tests first: preserve or extend existing tests. For any behavioral change, add a test that fails before implementing the change.
- Follow existing patterns rather than introducing new architecture:
  - Use `LanguageManager` and `SettingsManager` as shown in `src/main.ts` for i18n and settings lifecycle.
  - Validate and normalize external input using `.fix()` helpers (see `src/settings-data.ts`).
  - Reuse `PluginLocales` (`assets/locales.ts`) for translation resources and formatters.
- Build & scripts:
  - `scripts/build.mjs` uses esbuild `context()`; production builds write `metafile.json`. Use `process.argv[2] === 'dev'` to enable watch mode (tests mock this behavior in `tests/scripts/build.test.mjs`).
    - Metafile guidance: production builds emit `metafile.json`. After dependency or bundle changes, inspect `metafile.json` for large/new imports, attach it to the PR when relevant, and add a short rationale if the bundle grows significantly.
  - `scripts/obsidian-install.mjs` reads `manifest.json` for `id` and copies `manifest`, `main`, and `styles` to `<dest>/.obsidian/plugins/<id>`; it exits non-zero with a concise message when the manifest is missing—mirror these behaviors in integration tests (`tests/scripts/obsidian-install.test.mjs`).
- Tests & naming:
  - Unit tests: `*.spec.*` — fast, hermetic, BDD-style.
  - Integration tests: `*.test.*` — TDD-style; may use tmp dirs, child processes, or spawn/exec like `obsidian-install` tests.
  - Put tests under `tests/` mirroring `src/` layout. Follow the **one test file per source file** convention.
  - **Agent note:** the `vitest` CLI defaults to interactive/watch mode when invoked without a subcommand. Agents must use `vitest run <options>` or append `--run` so tests run non-interactively.
  - Flaky / slow-test policy: Avoid adding slow or flaky tests to the default suite. Mark slow or long-running tests clearly (place under `tests/slow/`, add a `.slow` suffix, or document in the test header), include a justification in the PR description, and add a separate integration-only run where appropriate. CI maintainers may request you to split, mock, or move tests out of the default fast suite.
- Localization:
  - Add keys by editing `assets/locales/en/translation.json` first. Keep `{{...}}` and `$t(...)` intact and **do not** translate placeholders.
  - Add a test when adding user-facing strings (or a localization note) so translators and CI can detect missing or bad keys.
- Committing & PRs:
  - Use Conventional Commits. Run `npm run commitlint` locally to validate. Aim for header ≤72 chars (tools still accept 100 — use 72 as a human buffer) and wrap body lines at 100 chars. Prefer 72 for readability.
  - Add a changeset for public API or release-impacting changes.
- When changing infra (build, tests, versioning), update `AGENTS.md` with concise rationale and local verification steps (include the exact commands you ran).

**Security note (short checklist):** edits that affect module-loading or dynamic execution (for example `src/require/**`, `eval`, or dynamic imports) are high-risk and require extra review. Quick PR checklist for these changes:

- Add unit and integration tests that validate sanitization, failure modes, and sandboxing assumptions.
- Include a short threat-model note in the PR describing attacker capabilities and mitigations.
- Tag the PR with `security` and request at least one reviewer with security expertise.
- Avoid `eval`/untrusted dynamic execution; if unavoidable, provide input validation/whitelisting and tests.
- Add manual verification steps or CI checks if loader behavior or resolution rules changed.

If anything here is unclear or incomplete, open a short issue or suggest a direct edit to `AGENTS.md` so agents that follow can stay up to date.

---

**Template merge guidance:** This file is maintained in the template repository and may be periodically merged into downstream repositories created from this template. For downstream repositories, prefer making minimal edits to template instruction files and, when possible, add a new repo-specific instruction file (for example, `.github/instructions/<your-repo>.instructions.md`) to capture local agent rules. This approach reduces merge conflicts when upstream changes are applied; if you must change a template file, keep edits minimal and document the reason in `AGENTS.md` or link to a short issue in your repo.
