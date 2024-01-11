# obsidian-modules <!-- markdownlint-disable MD024 -->

## 2.4.1

### Patch Changes

- f59c264: Properly detects TypeScript extensions. Fixes [GH#7](https://github.com/polyipseity/obsidian-modules/issues/7), which is about failing to import TypeScript modules on newer versions of Obsidian. ([GH#8](https://github.com/polyipseity/obsidian-modules/pull/8) by [@mnaoumov](https://github.com/mnaoumov))
- 976e1aa: Improve error message for unresolved module and loading timeout. ([GH#12](https://github.com/polyipseity/obsidian-modules/pull/12) by [@mnaoumov](https://github.com/mnaoumov))

## 2.4.0

### Minor Changes

- 45f7560: Add startup modules.
- 24dfc8d: Add `Require#onInvalidate`.

### Patch Changes

- de069e6: Provide `app` to avoid using the deprecated global `app`. For users, nothing needs to be changed.
- dbef51c: Fix importing from external links not working with custom require name.

## 2.3.0

No more console spamming and unchecked `data.json` growth!

### Minor Changes

- d724fef: Move settings `recovery` and `lastReadChangelogVersion` to `localStorage`. (6d612c570926387ee6b5991475cb993517a39d45)
- 307489d: Replace some `Record`s with `Map`s. (<https://2ality.com/2012/01/objects-as-maps.html>)

### Patch Changes

- b496460: Remove debug statements. Addresses [GH#5](https://github.com/polyipseity/obsidian-modules/issues/5). (+f9fc1874e2c0b0b6c486ae6a13e52bf09cef588d)

## 2.2.0

### Minor Changes

- 3b251be: Add cwd detection for `dv.view` in Dataview.
- ef032bf: Add cwd detection for Templater user scripts.
- fdbee2f: Add cwd detection for canvases.
- 2fd4dc4: Change the type and meaning of `null` and `undefined` for working directory. This allows overriding the working directory with no working directory in `CommonOptions`.
- 5fbad90: Always change the cwd context in preview and editor.

### Patch Changes

- 92b9215: Fix context detection for Templater templates.
- 004ed2e: Fix weird behaviors if the vault has more than 1000 files. Fixes [GH#4](https://github.com/polyipseity/obsidian-modules/issues/4).

## 2.1.0

### Minor Changes

- 9a7c8b6: Add command "Clear cache".
- 58abf99: Make the public `invalidate` invalidate more things.

### Patch Changes

- fdbca01: Reduce memory usage by up to 75% for preloaded files.
- 663d9eb: Fix canvas rendering nothing. Fixes [GH#2](https://github.com/polyipseity/obsidian-modules/issues/2).

## 2.0.0

### Major Changes

- 0c567c9: Add TypeScript support.

### Minor Changes

- 97eca08: Add setting "Require name".
- 24ed484: Move more work to workers and improve code.
- 459125e: Add setting "Markdown code block languages to load".
- a0bea02: Add support for importing external modules via HTTP and HTTPS.
- 4d79665: Add setting "Preloading rules".
- ccfbf35: Add setting "Preloaded external links".
- f36db52: Use workers to transpile TypeScript if async import is used.
- 26155df: Add setting "Expose internal modules". Cherry-picked from `d22f7bf6182272e3e0058c328ed42ec3039de184`, which is from `obsidian-terminal`.
- fd1f08c: Add setting `Expose internal modules`.
- 47c5f65: Allow importing a loading module multiple times. (Deadlocks may result though.)
- 9b43345: Implement source mapping. Sources are placed under `modules/`.
- c944a54: Rewrite dependency handling.
- a85b3b7: Add setting "Enable external links".
- fbcf7d2: Add relative path support for Templater.
- 0d9ed0f: Make importing from external CDNs work.
- d0adec9: Add setting "`import` timeout".

### Patch Changes

- b5f2d98: Assign `Symbol.toStringTag` to modules.
- 24cbb1c: Respect existing source maps when source mapping.
- a286c55: Define `process` so that React can load on mobile.
- c3a689e: Limit the number of concurrent requests to 6.
- fa98881: Compress the worker to reduce bundle size.
- 108639c: Fix plugin potentially failing to load. This may happen if `Community plugins > Debug startup time` is disabled. When it is disabled, Obsidian removes source maps, which erraneously removes JavaScript strings intentionally containinig source map-like content.
- e06bcf1: Add async `Transpile.atranspile`.
- b12e8ec: Move parsing to workers.
- 74c7da3: Prefix source map location with plugin ID.

## 1.1.0

### Minor Changes

- 8e538e7: Add `cwd` option to `require` and `require.import` to manually provide context.

### Patch Changes

- b3791a4: Create `AbstractFileResolve#aresolvePath` so that `metadataCache` is awaited for in async resolve.

## 1.0.2

### Patch Changes

- 48ee70f: Make the `require` patch more compatible with other `require` patches.

## 1.0.1

### Patch Changes

- ab7c316: Fix `require` not working at all.
- 3f0f57b: Fix dependency tracking, especially circular ones.

## 1.0.0

### Major Changes

- 879a4d6: Implement basic functionalities: vault path resolving, caching, module loading, `require` patching, and an API.

### Minor Changes

- 5fbc6b5: Implement resolving relative paths.
- ce395a7: Add `Resolve#aresolve` to support resolving files on-demand, making `require.import` support loading any files.
- c9d0d61: Implement dependency tracking so that modules are transitively reloaded.
- b37eb32: Implement resolving Markdown links and wikilinks.
- 7120162: Implement Markdown-to-JavaScript transpiler.

### Patch Changes

- 42f93f2: Remove arbitrary restrictions for resolving vault paths and relative paths.
- ed74c49: Write usage guide.
