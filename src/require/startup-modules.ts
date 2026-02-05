import {
  type AnyObject,
  SI_PREFIX_SCALE,
  activeSelf,
  addCommand,
  anyToError,
  asyncDebounce,
  launderUnchecked,
  printError,
} from "@polyipseity/obsidian-plugin-library";
import type { ModulesPlugin } from "../main.js";
import { STARTUP_MODULES_LOAD_DELAY } from "../magic.js";

class StartupModules {
  readonly #requested = new Set<string>();
  readonly #loaded = new Set<string>();
  #timer: number | undefined;
  readonly #load = asyncDebounce((resolve, reject, delay: number) => {
    try {
      const load0 = (): void => {
        try {
          resolve(
            Promise.all(
              [...this.#requested]
                .filter((requested) => !this.#loaded.has(requested))
                .map(async (requested) => {
                  await tryLoadModule(this.context, requested);
                  this.#loaded.add(requested);
                }),
            ),
          );
        } catch (error) {
          reject(error);
        }
      };
      self.clearTimeout(this.#timer);
      if (delay <= 0) {
        load0();
        return;
      }
      this.#timer = self.setTimeout(load0, SI_PREFIX_SCALE * delay);
    } catch (error) {
      reject(error);
    }
  });

  public constructor(protected readonly context: ModulesPlugin) {
    context.register(() => {
      self.clearTimeout(this.#timer);
    });
  }

  public async load(delay = 0, ...ids: readonly string[]): Promise<boolean> {
    const ret = !ids
      .map((id) => {
        const ret2 = this.#requested.has(id);
        this.#requested.add(id);
        return ret2;
      })
      .every(Boolean);
    await this.#load(delay);
    return ret;
  }

  public async reload(delay = 0, ...ids: readonly string[]): Promise<boolean> {
    for (const id of ids) {
      this.#loaded.delete(id);
    }
    return this.load(delay, ...ids);
  }

  public unload(...ids: readonly string[]): boolean {
    return ids
      .map((id) => {
        const ret = this.#requested.delete(id);
        this.#loaded.delete(id);
        return ret;
      })
      .some(Boolean);
  }
}

export async function loadStartupModules(
  context: ModulesPlugin,
): Promise<void> {
  const {
      api: { requires },
      app,
      language: { value: i18n },
      settings,
    } = context,
    req = requires.get(self),
    startupMods = new StartupModules(context);
  if (!req) {
    throw new Error();
  }
  settings.onMutate(
    (set) => set.startupModules,
    (cur, prev, set) => {
      const curSet = new Set(cur);
      startupMods.unload(...prev.filter((mod) => !curSet.has(mod)));
      if (!set.autoReloadStartupModules) {
        return;
      }
      startupMods
        .load(STARTUP_MODULES_LOAD_DELAY, ...cur)
        .catch((error: unknown) => {
          self.console.error(error);
        });
    },
  );
  settings.onMutate(
    (set) => set.autoReloadStartupModules,
    async (cur, _1, set) => {
      if (!cur) {
        return;
      }
      await startupMods.load(0, ...set.startupModules);
    },
  );
  req.onInvalidate.listen((id) => {
    if (!settings.value.startupModules.includes(id)) {
      return;
    }
    if (settings.value.autoReloadStartupModules) {
      startupMods
        .reload(STARTUP_MODULES_LOAD_DELAY, id)
        .catch((error: unknown) => {
          self.console.error(error);
        });
      return;
    }
    startupMods.unload(id);
  });
  addCommand(context, () => i18n.t("commands.reload-startup-modules"), {
    callback() {
      const { lastEvent } = app;
      (async (): Promise<void> => {
        try {
          await startupMods.reload(0, ...settings.value.startupModules);
        } catch (error) {
          activeSelf(lastEvent).console.error(error);
        }
      })();
    },
    icon: i18n.t("asset:commands.reload-startup-modules-icon"),
    id: "reload-startup-modules",
  });
  await startupMods.load(0, ...settings.value.startupModules);
}

async function tryLoadModule(
  context: ModulesPlugin,
  id: string,
): Promise<void> {
  const {
    language: { value: i18n },
  } = context;
  try {
    await loadModule(context, id);
  } catch (error) {
    printError(
      anyToError(error),
      () =>
        i18n.t("errors.error-loading-module", {
          id,
          interpolation: { escapeValue: false },
        }),
      context,
    );
  }
}

async function loadModule(context: ModulesPlugin, id: string): Promise<void> {
  const {
      api: { requires },
      language: { value: i18n },
    } = context,
    req = requires.get(self);
  if (!req) {
    throw new Error();
  }
  const mod = await req.import(id),
    func = launderUnchecked<AnyObject>(mod)["default"] ?? mod;
  if (typeof func !== "function") {
    throw new Error(i18n.t("errors.no-functions-exported"));
  }

  await func();
}
