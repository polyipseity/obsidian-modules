import {
	DocumentationMarkdownView,
	StorageSettingsManager,
	addCommand,
	anyToError,
	deepFreeze,
	printError,
	revealPrivate,
	typedKeys,
} from "@polyipseity/obsidian-plugin-library"
import { DOMClasses2 } from "./magic.js"
import type { ModulesPlugin } from "./main.js"
import changelogMd from "../CHANGELOG.md"
import readmeMd from "../README.md"
import semverLt from "semver/functions/lt.js"

export const DOCUMENTATIONS = deepFreeze({
	async changelog(view: DocumentationMarkdownView.Registered, active: boolean) {
		await view.open(active, {
			data: await changelogMd,
			displayTextI18nKey: "translation:generic.documentations.changelog",
			iconI18nKey: "asset:generic.documentations.changelog-icon",
		})
	},
	donate(view: DocumentationMarkdownView.Registered) {
		const { context, context: { app, manifest } } = view
		revealPrivate(context, [app], app0 => {
			const { setting: { settingTabs } } = app0
			for (const tab of settingTabs) {
				const { id, containerEl: { ownerDocument } } = tab
				if (id !== "community-plugins") { continue }
				const div = ownerDocument.createElement("div")
				tab.renderInstalledPlugin(manifest, div)
				const element = div.querySelector(
					`.${DOMClasses2.SVG_ICON}.${DOMClasses2.LUCIDE_HEART}`,
				)?.parentElement
				if (!element) { throw new Error(String(div)) }
				element.click()
				return
			}
			throw new Error(settingTabs.toString())
		}, error => { throw error })
	},
	async readme(view: DocumentationMarkdownView.Registered, active: boolean) {
		await view.open(active, {
			data: await readmeMd,
			displayTextI18nKey: "translation:generic.documentations.readme",
			iconI18nKey: "asset:generic.documentations.readme-icon",
		})
	},
})
export type DocumentationKeys = readonly ["changelog", "donate", "readme"]
export const DOCUMENTATION_KEYS = typedKeys<DocumentationKeys>()(DOCUMENTATIONS)

class Loaded0 {
	public constructor(
		public readonly context: ModulesPlugin,
		public readonly docMdView: DocumentationMarkdownView.Registered,
	) { }

	public open(key: DocumentationKeys[number], active = true): void {
		const {
			context,
			context: { version, language: { value: i18n }, localSettings },
			docMdView,
		} = this;
		(async (): Promise<void> => {
			try {
				await DOCUMENTATIONS[key](docMdView, active)
				if (key === "changelog" && version !== null) {
					localSettings.mutate(lsm => {
						lsm.lastReadChangelogVersion = version
					}).then(async () => localSettings.write())
						.catch((error: unknown) => { self.console.error(error) })
				}
			} catch (error) {
				printError(
					anyToError(error),
					() => i18n.t("errors.error-opening-documentation"),
					context,
				)
			}
		})()
	}
}
export function loadDocumentations(
	context: ModulesPlugin,
	readme = false,
): loadDocumentations.Loaded {
	const
		{
			version,
			language: { value: i18n },
			localSettings,
			settings,
		} = context,
		ret = new Loaded0(
			context,
			DocumentationMarkdownView.register(context),
		)
	for (const doc of DOCUMENTATION_KEYS) {
		addCommand(context, () => i18n.t(`commands.open-documentation-${doc}`), {
			callback() { ret.open(doc) },
			icon: i18n.t(`asset:commands.open-documentation-${doc}-icon`),
			id: `open-documentation.${doc}`,
		})
	}
	if (readme) { ret.open("readme", false) }
	if (version !== null &&
		settings.value.openChangelogOnUpdate &&
		!StorageSettingsManager.hasFailed(localSettings.value) &&
		semverLt(localSettings.value.lastReadChangelogVersion, version)) {
		ret.open("changelog", false)
	}
	return ret
}
export namespace loadDocumentations {
	export type Loaded = Loaded0
}
