declare module "templater-obsidian" {
	// https://silentvoid13.github.io/Templater/internal-functions/internal-modules/config-module.html
	interface ConfigModule {
		// eslint-disable-next-line @typescript-eslint/naming-convention
		readonly template_file: TFile | undefined
	}
	// https://github.com/SilentVoid13/Templater/blob/487805b5ad1fd7fbc145040ed82b4c41fc2c48e2/src/core/functions/FunctionsGenerator.ts#L13
	interface FunctionsGenerator {
		// eslint-disable-next-line @typescript-eslint/naming-convention
		readonly user_functions: UserFunctions
	}
	// https://silentvoid13.github.io/Templater/internal-functions/overview.html
	interface FunctionsObject {
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
		// eslint-disable-next-line @typescript-eslint/naming-convention
		readonly functions_generator: FunctionsGenerator
		readonly parser: Parser
	}
	// https://github.com/SilentVoid13/Templater/blob/487805b5ad1fd7fbc145040ed82b4c41fc2c48e2/src/main.ts#L15
	interface TemplaterPlugin extends Plugin {
		readonly templater: Templater
	}
	// https://github.com/SilentVoid13/Templater/blob/487805b5ad1fd7fbc145040ed82b4c41fc2c48e2/src/core/functions/user_functions/UserFunctions.ts#L7
	interface UserFunctions {
		// eslint-disable-next-line @typescript-eslint/naming-convention
		readonly user_script_functions: UserScriptFunctions
	}
	// https://github.com/SilentVoid13/Templater/blob/487805b5ad1fd7fbc145040ed82b4c41fc2c48e2/src/core/functions/user_functions/UserScriptFunctions.ts#L8
	interface UserScriptFunctions {
		// https://github.com/SilentVoid13/Templater/blob/487805b5ad1fd7fbc145040ed82b4c41fc2c48e2/src/core/functions/user_functions/UserScriptFunctions.ts#L37
		// eslint-disable-next-line @typescript-eslint/naming-convention
		readonly load_user_script_function: (
			file: TFile,
			user_script_functions: Map<string, () => unknown>,
		) => PromiseLike<void>
	}
}
import type { } from "templater-obsidian"
import type { Plugin, TFile } from "obsidian"
