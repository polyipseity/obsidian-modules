/**
 * Public API for `obsidian-modules`.
 */
declare module "obsidian-modules" {

	/**
	 * API exposed on the plugin instance as the property `api`.
	 */
	interface API {

		/**
		 * Object mapping global objects to {@link Require}s.
		 */
		readonly requires: WeakMap<typeof globalThis, Require>
	}

	/**
	 * Custom `require`s.
	 */
	interface Require {

		/**
		 * Imports a module, CommonJS style.
		 *
		 * @param id module specifier
		 * @param opts options
		 * @return the requested module
		 * @throws if the requested module cannot be found
		 */
		(id: string, opts?: RequireOptions): unknown

		/**
		 * Imports a module, ES-module style.
		 *
		 * @param id module specifier
		 * @param opts options
		 * @returns the requested module
		 * @throws if the requested module cannot be found
		 */
		readonly import: (id: string, opts?: ImportOptions) => unknown

		/**
		 * Object for resolving module specifiers.
		 */
		readonly resolve: Resolve

		/**
		 * Cache for loaded modules.
		 */
		readonly cache: WeakMap<Resolved["identity"], ModuleCache>

		/**
		 * Context for loading modules.
		 */
		readonly context: Context
	}

	/**
	 * Options for {@link Require} and {@link Require.import},
	 */
	interface CommonOptions {

		/**
		 * Current working directory for resolving contextual module specifiers.
		 *
		 * @default string automatically inferred if possible
		 */
		readonly cwd?: string
	}

	/**
	 * Options for {@link Require}.
	 */
	// eslint-disable-next-line @typescript-eslint/no-empty-interface
	interface RequireOptions extends CommonOptions { }

	/**
	 * Options for {@link Require.import}.
	 */
	interface ImportOptions extends CommonOptions {

		/**
		 * Enable loading CommonJS modules.
		 *
		 * @default false|true depending on settings
		 */
		readonly commonJSInterop?: boolean
	}

	/**
	 * Cache for loaded modules.
	 */
	interface ModuleCache {

		/**
		 * Module exports when loaded as a CommonJS module.
		 */
		readonly commonJS?: unknown

		/**
		 * Module exports when loaded as an ES module.
		 */
		readonly esModule?: unknown

		/**
		 * Module exports when loaded as an ES module with CommonJS interop.
		 */
		readonly esModuleWithCommonJS?: unknown
	}

	/**
	 * Object for resolving module specifiers.
	 */
	interface Resolve {

		/**
		 * Resolves a module specifier.
		 *
		 * @param id module specifier
		 * @param context resolve context
		 * @returns the resolved module data or `null` if not found
		 */
		readonly resolve: (id: string, context: Context) => Resolved | null

		/**
		 * Resolves a module specifier, supporting async resources.
		 *
		 * @param id module specifier
		 * @param context resolve context
		 * @returns the resolved module data or `null` if not found
		 */
		readonly aresolve: (
			id: string,
			context: Context,
		) => PromiseLike<Resolved | null>
	}

	/**
	 * Data of a resolved module.
	 */
	interface Resolved {

		/**
		 * Identity of the resolved module.
		 */
		readonly identity: object

		/**
		 * Module specifier of the resolved module.
		 */
		readonly id: string

		/**
		 * Code of the resolved module.
		 */
		readonly code: string

		/**
		 * Exports of the resolved module.
		 */
		readonly value?: unknown

		/**
		 * Working directory of the resolved module.
		 */
		readonly cwd?: string
	}

	/**
	 * Context for loading modules.
	 */
	interface Context {

		/**
		 * Current working directory.
		 */
		readonly cwds: string[]

		/**
		 * Identity of the parent module being loaded.
		 */
		parent?: Resolved["identity"]

		/**
		 * Module dependencies.
		 */
		readonly dependencies: WeakMap<Resolved["identity"
		], Set<Resolved["identity"]>>
	}
}
import type { } from "obsidian-modules"
