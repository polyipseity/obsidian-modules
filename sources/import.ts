/* eslint-disable @typescript-eslint/no-require-imports */
import {
	deepFreeze,
	typedKeys,
} from "@polyipseity/obsidian-plugin-library"

// Needed for bundler
const BUNDLE0 = deepFreeze({
	// eslint-disable-next-line @typescript-eslint/naming-convention
	"@ts-morph/bootstrap": (): unknown => require("@ts-morph/bootstrap"),
})
export const
	BUNDLE = new Map(Object.entries(BUNDLE0)),
	MODULES = typedKeys<readonly [
		"@ts-morph/bootstrap",
	]>()(BUNDLE0)
