declare module "templater-obsidian" {
	// https://silentvoid13.github.io/Templater/internal-functions/internal-modules/config-module.html
	interface ConfigModule {
		// eslint-disable-next-line @typescript-eslint/naming-convention
		readonly template_file: TFile | undefined
	}
	// https://silentvoid13.github.io/Templater/internal-functions/overview.html
	interface FunctionsObject extends Record<string, unknown> {
		readonly config: ConfigModule
	}
	// https://github.com/SilentVoid13/Templater/blob/487805b5ad1fd7fbc145040ed82b4c41fc2c48e2/src/core/parser/Parser.ts#L7
	interface Parser {
		// eslint-disable-next-line @typescript-eslint/naming-convention
		readonly parse_commands: (
			content: string,
			context: FunctionsObject,
		) => PromiseLike<string>
	}
	// https://github.com/SilentVoid13/Templater/blob/487805b5ad1fd7fbc145040ed82b4c41fc2c48e2/src/core/Templater.ts#L39
	interface Templater {
		readonly parser: Parser
	}
	// https://github.com/SilentVoid13/Templater/blob/487805b5ad1fd7fbc145040ed82b4c41fc2c48e2/src/main.ts#L15
	interface TemplaterPlugin extends Plugin {
		readonly templater: Templater
	}
}
import type { } from "templater-obsidian"
import type { Plugin, TFile } from "obsidian"
