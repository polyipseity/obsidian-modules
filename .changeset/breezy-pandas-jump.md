---
"obsidian-modules": patch
---

Remove `_0x`-looking strings from the bundled `main.js` by renaming a TypeScript compiler diagnostic identifier at build time, so the automated review no longer flags the output as obfuscated.
