import {
  type Fixed,
  NOTICE_NO_TIMEOUT,
  NULL_SEM_VER_STRING,
  PluginContext,
  type SemVerString,
  cloneAsWritable,
  deepFreeze,
  fixArray,
  fixInSet,
  fixTyped,
  launderUnchecked,
  markFixed,
  opaqueOrDefault,
  semVerString,
} from "@polyipseity/obsidian-plugin-library";
import type { MarkOptional } from "ts-essentials";
import { PluginLocales } from "../assets/locales.js";

export interface LocalSettings extends PluginContext.LocalSettings {
  readonly lastReadChangelogVersion: SemVerString;
}
export namespace LocalSettings {
  export function fix(self0: unknown): Fixed<LocalSettings> {
    const unc = launderUnchecked<LocalSettings>(self0);
    return markFixed(self0, {
      ...PluginContext.LocalSettings.fix(self0).value,
      lastReadChangelogVersion: opaqueOrDefault(
        semVerString,
        String(unc.lastReadChangelogVersion),
        NULL_SEM_VER_STRING
      ),
    });
  }
}

export interface Settings extends PluginContext.Settings {
  readonly language: Settings.DefaultableLanguage;
  readonly requireName: string;
  readonly exposeInternalModules: boolean;
  readonly enableExternalLinks: boolean;
  readonly preloadingRules: readonly string[];
  readonly preloadedExternalLinks: readonly string[];
  readonly markdownCodeBlockLanguagesToLoad: readonly string[];
  readonly importTimeout: number;

  readonly startupModules: readonly string[];
  readonly autoReloadStartupModules: boolean;

  readonly openChangelogOnUpdate: boolean;
}
export namespace Settings {
  export const optionals = deepFreeze([]) satisfies readonly (keyof Settings)[];
  export type Optionals = (typeof optionals)[number];
  export type Persistent = Omit<Settings, Optionals>;
  export function persistent(settings: Settings): Persistent {
    const ret: MarkOptional<Settings, Optionals> = cloneAsWritable(settings);
    for (const optional of optionals) {
      delete ret[optional];
    }
    return ret;
  }

  export const DEFAULT: Persistent = deepFreeze({
    autoReloadStartupModules: true,
    enableExternalLinks: false,
    errorNoticeTimeout: NOTICE_NO_TIMEOUT,
    exposeInternalModules: true,
    importTimeout: 10,
    language: "",
    markdownCodeBlockLanguagesToLoad: ["JS", "TS", "JavaScript", "TypeScript"],
    noticeTimeout: 5,
    openChangelogOnUpdate: true,
    preloadedExternalLinks: [],
    preloadingRules: ["+/\\.m?[jt]s(?:\\.md)?$/iu"],
    requireName: "require",
    startupModules: [],
  });

  export const DEFAULTABLE_LANGUAGES = deepFreeze([
    "",
    ...PluginLocales.LANGUAGES,
  ]);
  export type DefaultableLanguage = (typeof DEFAULTABLE_LANGUAGES)[number];
  export function fix(self0: unknown): Fixed<Settings> {
    const unc = launderUnchecked<Settings>(self0);
    return markFixed(self0, {
      ...PluginContext.Settings.fix(self0).value,
      autoReloadStartupModules: fixTyped(
        DEFAULT,
        unc,
        "autoReloadStartupModules",
        ["boolean"]
      ),
      enableExternalLinks: fixTyped(DEFAULT, unc, "enableExternalLinks", [
        "boolean",
      ]),
      errorNoticeTimeout: fixTyped(DEFAULT, unc, "errorNoticeTimeout", [
        "number",
      ]),
      exposeInternalModules: fixTyped(DEFAULT, unc, "exposeInternalModules", [
        "boolean",
      ]),
      importTimeout: fixTyped(DEFAULT, unc, "importTimeout", ["number"]),
      language: fixInSet(DEFAULT, unc, "language", DEFAULTABLE_LANGUAGES),
      markdownCodeBlockLanguagesToLoad: fixArray(
        DEFAULT,
        unc,
        "markdownCodeBlockLanguagesToLoad",
        ["string"]
      ),
      noticeTimeout: fixTyped(DEFAULT, unc, "noticeTimeout", ["number"]),
      openChangelogOnUpdate: fixTyped(DEFAULT, unc, "openChangelogOnUpdate", [
        "boolean",
      ]),
      preloadedExternalLinks: fixArray(DEFAULT, unc, "preloadedExternalLinks", [
        "string",
      ]),
      preloadingRules: fixArray(DEFAULT, unc, "preloadingRules", ["string"]),
      requireName: fixTyped(DEFAULT, unc, "requireName", ["string"]),
      startupModules: fixArray(DEFAULT, unc, "startupModules", ["string"]),
    });
  }
}
