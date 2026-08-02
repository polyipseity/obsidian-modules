/* eslint-disable @typescript-eslint/no-require-imports -- The literal `require` is special. Bundlers recognize it to successfully bundle the modules. */
import { deepFreeze, typedKeys } from "@polyipseity/obsidian-plugin-library";

// Needed for bundler
const BUNDLE0 = deepFreeze({
  "@ts-morph/bootstrap": (): unknown => require("@ts-morph/bootstrap"),
});
export const BUNDLE = new Map(Object.entries(BUNDLE0)),
  MODULES = typedKeys<readonly ["@ts-morph/bootstrap"]>()(BUNDLE0);
/* eslint-enable @typescript-eslint/no-require-imports -- The literal `require` is special. Bundlers recognize it to successfully bundle the modules. */
