/* eslint-disable @typescript-eslint/no-require-imports -- `require` is a CommonJS runtime global provided by Obsidian's module loader */
import { deepFreeze, typedKeys } from "@polyipseity/obsidian-plugin-library";

// Needed for bundler
const BUNDLE0 = deepFreeze({
  "@ts-morph/bootstrap": (): unknown => require("@ts-morph/bootstrap"),
});
export const BUNDLE = new Map(Object.entries(BUNDLE0)),
  MODULES = typedKeys<readonly ["@ts-morph/bootstrap"]>()(BUNDLE0);
/* eslint-enable @typescript-eslint/no-require-imports -- `require` is a CommonJS runtime global provided by Obsidian's module loader */
