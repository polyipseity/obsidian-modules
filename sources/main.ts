import { type App, Plugin, type PluginManifest } from "obsidian"
import {
	LanguageManager,
	type PluginContext,
	SI_PREFIX_SCALE,
	SettingsManager,
	StorageSettingsManager,
	createI18n,
	semVerString,
} from "@polyipseity/obsidian-plugin-library"
import { LocalSettings, Settings } from "./settings-data.js"
import { MAX_FETCH_CONCURRENCY, PLUGIN_UNLOAD_DELAY } from "./magic.js"
import { type Pool, pool } from "workerpool"
import type { API } from "obsidian-modules"
// eslint-disable-next-line @typescript-eslint/naming-convention
import PLazy from "p-lazy"
import { PluginLocales } from "../assets/locales.js"
import { PromisePoolExecutor } from "promise-pool-executor"
import { isNil } from "lodash-es"
import { loadDocumentations } from "./documentations.js"
import { loadRequire } from "./require/require.js"
import { loadSettings } from "./settings.js"
import { toObjectURL } from "@aidenlx/esbuild-plugin-inline-worker/utils"
// eslint-disable-next-line import/no-unresolved
import worker from "worker:./worker.js"

export class ModulesPlugin
	extends Plugin
	implements PluginContext<Settings, LocalSettings> {
	public readonly version
	public readonly language: LanguageManager
	public readonly localSettings: StorageSettingsManager<LocalSettings>
	public readonly settings: SettingsManager<Settings>

	public readonly api: API = Object.freeze({ requires: new WeakMap() })
	public readonly fetchPool = new PromisePoolExecutor({
		concurrencyLimit: MAX_FETCH_CONCURRENCY,
	})

	public readonly workerPool = PLazy.from(async (): Promise<Pool> => {
		const url = toObjectURL(await worker)
		try {
			this.register(() => { URL.revokeObjectURL(url) })
			const ret = pool(url, { workerType: "web" })
			this.register(async () => ret.terminate(true))
			return ret
		} catch (error) {
			URL.revokeObjectURL(url)
			throw error
		}
	})

	public constructor(app: App, manifest: PluginManifest) {
		super(app, manifest)
		try {
			this.version = semVerString(manifest.version)
		} catch (error) {
			self.console.warn(error)
			this.version = null
		}
		this.language = new LanguageManager(
			this,
			async () => createI18n(
				PluginLocales.RESOURCES,
				PluginLocales.FORMATTERS,
				{
					defaultNS: PluginLocales.DEFAULT_NAMESPACE,
					fallbackLng: PluginLocales.FALLBACK_LANGUAGES,
					returnNull: PluginLocales.RETURN_NULL,
				},
			),
		)
		this.localSettings = new StorageSettingsManager(this, LocalSettings.fix)
		this.settings = new SettingsManager(this, Settings.fix)
	}

	public displayName(unlocalized = false): string {
		return unlocalized
			? this.language.value.t("name", {
				interpolation: { escapeValue: false },
				lng: PluginLocales.DEFAULT_LANGUAGE,
			})
			: this.language.value.t("name")
	}

	public override onload(): void {
		(async (): Promise<void> => {
			try {
				const loaded: unknown = await this.loadData(),
					{
						language,
						localSettings,
						settings,
					} = this,
					earlyChildren = [language, localSettings, settings],
					// Placeholder to resolve merge conflicts more easily
					children: never[] = []
				for (const child of earlyChildren) { child.unload() }
				for (const child of earlyChildren) {
					// Delay unloading as there are unload tasks that cannot be awaited
					this.register(() => {
						const id = self.setTimeout(() => {
							child.unload()
						}, PLUGIN_UNLOAD_DELAY * SI_PREFIX_SCALE)
						child.register(() => { self.clearTimeout(id) })
					})
					child.load()
				}
				await Promise.all(earlyChildren.map(async child => child.onLoaded))
				for (const child of children) { this.addChild(child) }
				await Promise.all([
					Promise.resolve().then(() => {
						loadSettings(this, loadDocumentations(this, isNil(loaded)))
					}),
					loadRequire(this),
				])
			} catch (error) {
				self.console.error(error)
			}
		})()
	}
}
// Needed for loading
export default ModulesPlugin
