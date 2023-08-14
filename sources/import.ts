/* eslint-disable @typescript-eslint/no-require-imports */
import {
	deepFreeze,
	typedKeys,
} from "@polyipseity/obsidian-plugin-library"

export const
	// Needed for bundler
	BUNDLE = deepFreeze({
		// eslint-disable-next-line @typescript-eslint/naming-convention
		"@ts-morph/bootstrap": (): unknown => require("@ts-morph/bootstrap"),
	}),
	MODULES = typedKeys<readonly [
		"@ts-morph/bootstrap",
	]>()(BUNDLE)
