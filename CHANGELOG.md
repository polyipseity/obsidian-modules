# obsidian-modules

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
