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
    readonly requires: WeakMap<typeof globalThis, Require>;
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
    (id: string, opts?: RequireOptions): unknown;

    /**
     * Imports a module, ES-module style.
     *
     * @param id module specifier
     * @param opts options
     * @returns the requested module
     * @throws if the requested module cannot be found
     */
    readonly import: (id: string, opts?: ImportOptions) => unknown;

    /**
     * Invalidate the cache of a module or an alias.
     *
     * @param id module specifier
     * @returns void
     */
    readonly invalidate: (id: string) => AsyncOrSync<void>;

    /**
     * Invalidate all caches.
     *
     * @returns void
     */
    readonly invalidateAll: () => AsyncOrSync<void>;

    /**
     * Module invalidation event.
     */
    readonly onInvalidate: EventEmitterLite<readonly [id: string]>;

    /**
     * Object for resolving module specifiers.
     */
    readonly resolve: Resolve;

    /**
     * Cache for loaded modules.
     */
    readonly cache: Map<string, ModuleCache>;

    /**
     * Aliased modules.
     */
    readonly aliased: Map<string, string>;

    /**
     * Module aliases.
     */
    readonly aliases: Map<string, Set<string>>;

    /**
     * Associated {@link App}.
     */
    readonly app: App;

    /**
     * Context for loading modules.
     */
    readonly context: Context;

    /**
     * Module dependants.
     */
    readonly dependants: Map<string, Set<string>>;

    /**
     * Module dependencies.
     */
    readonly dependencies: Map<string, Set<string>>;
  }

  /**
   * Options for {@link Require} and {@link Require.import},
   */
  interface CommonOptions {
    /**
     * Current working directory for resolving contextual module specifiers.
     *
     * `undefined` does not change the working directory, while `null`
     * overrides it with no working directory.
     *
     * @default string automatically inferred if possible
     */
    readonly cwd?: string | null | undefined;
  }

  /**
   * Options for {@link Require}.
   */
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface RequireOptions extends CommonOptions {}

  /**
   * Options for {@link Require.import}.
   */
  interface ImportOptions extends CommonOptions {
    /**
     * Enable loading CommonJS modules.
     *
     * @default false|true depending on settings
     */
    readonly commonJSInterop?: boolean | undefined;
  }

  /**
   * Cache for loaded modules.
   */
  interface ModuleCache {
    /**
     * Module exports when loaded as a CommonJS module.
     */
    readonly commonJS?: unknown;

    /**
     * Module exports when loaded as an ES module.
     */
    readonly esModule?: unknown;

    /**
     * Module exports when loaded as an ES module with CommonJS interop.
     */
    readonly esModuleWithCommonJS?: unknown;
  }

  /**
   * Object for resolving module specifiers.
   */
  interface Resolve {
    /**
     * Module resolution invalidation event.
     */
    readonly onInvalidate: EventEmitterLite<readonly [id: string]>;

    /**
     * Resolves a module specifier.
     *
     * @param id module specifier
     * @param context resolve context
     * @returns the resolved module data or `null` if not found
     */
    readonly resolve: (id: string, context: Context) => Resolved | null;

    /**
     * Resolves a module specifier, supporting async resources.
     *
     * @param args see {@link resolve}
     * @returns see {@link resolve}
     */
    readonly aresolve: (
      ...args: Parameters<Resolve["resolve"]>
    ) => AsyncOrSync<ReturnType<Resolve["resolve"]>>;

    /**
     * Invalidate the cache of a module resolution.
     *
     * @param id module specifier
     * @returns void
     */
    readonly invalidate: (id: string) => AsyncOrSync<void>;

    /**
     * Invalidate all caches.
     *
     * @returns void
     */
    readonly invalidateAll: () => AsyncOrSync<void>;
  }

  /**
   * Data of a resolved module.
   */
  interface Resolved {
    /**
     * Module specifier of the resolved module.
     */
    readonly id: string;

    /**
     * Code of the resolved module.
     */
    readonly code: string;

    /**
     * Compiled code of the resolved module.
     *
     * Only used by {@link Require} but not {@link Require.import}.
     */
    readonly compiledSyncCode?: string | undefined;

    /**
     * Whether to use cache.
     *
     * @default true
     */
    readonly cache?: boolean | undefined;

    /**
     * Working directory of the resolved module.
     *
     * `undefined` is an alias for `null`.
     */
    readonly cwd?: string | null | undefined;

    /**
     * Exports of the resolved module.
     */
    readonly value?: unknown;
  }

  /**
   * Context for loading modules.
   */
  interface Context {
    /**
     * Current working directory.
     *
     * `null` means no working directory.
     */
    readonly cwds: (string | null)[];

    /**
     * Identity of the parent module being loaded.
     */
    readonly parents: (string | undefined)[];
  }
}
import type {} from "obsidian-modules";
import type { App } from "obsidian";
import type { AsyncOrSync } from "ts-essentials";
import type { EventEmitterLite } from "@polyipseity/obsidian-plugin-library";
