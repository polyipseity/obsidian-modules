import {
  AdvancedSettingTab,
	type AnyObject,
	DOMClasses,
	ListModal,
	cloneAsWritable,
  closeSetting,
	createChildElement,
	createDocumentFragment,
	launderUnchecked,
  linkSetting,
  registerSettingsCommands,
  resetButton,
	rulesList,
	setTextToNumber,
} from "@polyipseity/obsidian-plugin-library";
import { constant, identity, isObject } from "lodash-es"
import type { ModulesPlugin } from "./main.js";
import { REQUIRE_TAG } from "./require/require.js"
import { Settings } from "./settings-data.js";
import type { loadDocumentations } from "./documentations.js";
import semverLt from "semver/functions/lt.js";

export class SettingTab extends AdvancedSettingTab<Settings> {
  public constructor(
    protected override readonly context: ModulesPlugin,
    protected readonly docs: loadDocumentations.Loaded,
  ) {
    super(context);
  }

	protected override onLoad(): void {
		super.onLoad()
		const {
			containerEl,
			context,
			context: { language: { value: i18n }, localSettings, settings, version },
			docs,
			ui,
		} = this
		this.newDescriptionWidget()
		this.newLanguageWidget(
			Settings.DEFAULTABLE_LANGUAGES,
			language => language
				? i18n.t(`language:${language}`)
				: i18n.t("settings.language-default"),
			Settings.DEFAULT,
		)
		ui.newSetting(containerEl, setting => {
			setting
				.setName(i18n.t("settings.documentation"))
				.addButton(button => button
					.setIcon(i18n.t("asset:settings.documentations.donate-icon"))
					.setTooltip(i18n.t("settings.documentations.donate"))
					.setCta()
					.onClick(() => { docs.open("donate") }))
				.addButton(button => button
					.setIcon(i18n.t("asset:settings.documentations.readme-icon"))
					.setTooltip(i18n.t("settings.documentations.readme"))
					.setCta()
					.onClick(() => {
						docs.open("readme")
						closeSetting(containerEl)
					}))
				.addButton(button => {
					button
						.setIcon(i18n.t("asset:settings.documentations.changelog-icon"))
						.setTooltip(i18n.t("settings.documentations.changelog"))
						.onClick(() => {
							docs.open("changelog")
							closeSetting(containerEl)
						})
					if (version === null ||
						semverLt(localSettings.value.lastReadChangelogVersion, version)) {
						button.setCta()
					}
				})
		})
		this.newAllSettingsWidget(
			Settings.DEFAULT,
			Settings.fix,
		)
		ui
			.newSetting(containerEl, setting => {
				const { settingEl } = setting,
					req = launderUnchecked<AnyObject>(self)[settings.value.requireName],
					req2 = isObject(req) ? req : {}
				setting
					.setName(createDocumentFragment(settingEl.ownerDocument, frag => {
						createChildElement(frag, "span", ele => {
							ele.innerHTML = i18n.t("settings.require-name-HTML")
						})
					}))
					.setDesc(REQUIRE_TAG in req2
						? ""
						: createDocumentFragment(settingEl.ownerDocument, frag => {
							createChildElement(frag, "span", ele => {
								ele.classList.add(DOMClasses.MOD_WARNING)
								ele.textContent =
									i18n.t("settings.require-name-description-invalid")
							})
						}))
					.addText(linkSetting(
						() => settings.value.requireName,
						async value => settings.mutate(settingsM => {
							settingsM.requireName = value
						}),
						() => { this.postMutate() },
					))
					.addExtraButton(resetButton(
						i18n.t("asset:settings.require-name-icon"),
						i18n.t("settings.reset"),
						async () => settings.mutate(settingsM => {
							settingsM.requireName = Settings.DEFAULT.requireName
						}),
						() => { this.postMutate() },
					))
			})
			.newSetting(containerEl, setting => {
				const { settingEl } = setting
				setting
					.setName(i18n.t("settings.expose-internal-modules"))
					.setDesc(createDocumentFragment(settingEl.ownerDocument, frag => {
						createChildElement(frag, "span", ele => {
							ele.innerHTML = i18n
								.t("settings.expose-internal-modules-description-HTML")
						})
					}))
					.addToggle(linkSetting(
						() => settings.value.exposeInternalModules,
						async value => settings.mutate(settingsM => {
							settingsM.exposeInternalModules = value
						}),
						() => { this.postMutate() },
					))
					.addExtraButton(resetButton(
						i18n.t("asset:settings.expose-internal-modules-icon"),
						i18n.t("settings.reset"),
						async () => settings.mutate(settingsM => {
							settingsM.exposeInternalModules =
								Settings.DEFAULT.exposeInternalModules
						}),
						() => { this.postMutate() },
					))
			})
			.newSetting(containerEl, setting => {
				setting
					.setName(i18n.t("settings.enable-external-links"))
					.addToggle(linkSetting(
						() => settings.value.enableExternalLinks,
						async value => settings.mutate(settingsM => {
							settingsM.enableExternalLinks = value
						}),
						() => { this.postMutate() },
					))
					.addExtraButton(resetButton(
						i18n.t("asset:settings.enable-external-links-icon"),
						i18n.t("settings.reset"),
						async () => settings.mutate(settingsM => {
							settingsM.enableExternalLinks =
								Settings.DEFAULT.enableExternalLinks
						}),
						() => { this.postMutate() },
					))
			})
			.newSetting(containerEl, setting => {
				const { settingEl } = setting
				setting
					.setName(i18n.t("settings.preloading-rules"))
					.setDesc(createDocumentFragment(settingEl.ownerDocument, frag => {
						createChildElement(frag, "span", ele => {
							ele.innerHTML =
								i18n.t("settings.preloading-rules-description-HTML", {
									count: settings.value.preloadingRules.length,
									interpolation: { escapeValue: false },
								})
						})
					}))
					.addButton(button => {
						button
							.setIcon(i18n.t("asset:settings.preloading-rules-edit-icon"))
							.setTooltip(i18n.t("settings.preloading-rules-edit"))
							.onClick(() => {
								rulesList(
									context,
									settings.value.preloadingRules,
									{
										callback: async (value): Promise<void> => {
											await settings.mutate(settingsM => {
												settingsM.preloadingRules = value
											})
											this.postMutate()
										},
										title: () => i18n.t("settings.preloading-rules"),
									},
								).open()
							})
					})
					.addExtraButton(resetButton(
						i18n.t("asset:settings.preloading-rules-icon"),
						i18n.t("settings.reset"),
						async () => settings.mutate(settingsM => {
							settingsM.preloadingRules =
								cloneAsWritable(Settings.DEFAULT.preloadingRules)
						}),
						() => { this.postMutate() },
					))
			})
			.newSetting(containerEl, setting => {
				const { settingEl } = setting,
					pf = "settings.preloaded-external-links"
				setting
					.setName(i18n.t(pf))
					.setDesc(createDocumentFragment(settingEl.ownerDocument, frag => {
						createChildElement(frag, "span", ele => {
							ele.innerHTML =
								i18n.t(`${pf}-description-HTML`, {
									count: settings.value.preloadedExternalLinks.length,
									interpolation: { escapeValue: false },
								})
						})
					}))
					.addButton(button => {
						button
							.setIcon(i18n.t(`asset:${pf}-edit-icon`))
							.setTooltip(i18n.t(`${pf}-edit`))
							.onClick(() => {
								new ListModal(
									context,
									ListModal.stringInputter<string>({
										back: identity,
										forth: identity,
									}),
									constant(""),
									settings.value.preloadedExternalLinks,
									{
										callback: async (value): Promise<void> => {
											await settings.mutate(settingsM => {
												settingsM.preloadedExternalLinks = value
											})
											this.postMutate()
										},
										title: (): string => i18n.t(pf),
									},
								).open()
							})
					})
					.addExtraButton(resetButton(
						i18n.t(`asset:${pf}-icon`),
						i18n.t("settings.reset"),
						async () => settings.mutate(settingsM => {
							settingsM.preloadedExternalLinks =
								cloneAsWritable(Settings.DEFAULT.preloadedExternalLinks)
						}),
						() => { this.postMutate() },
					))
			})
			.newSetting(containerEl, setting => {
				const pf = "settings.Markdown-code-block-languages-to-load"
				setting
					.setName(i18n.t(pf))
					.setDesc(i18n.t(`${pf}-description`, {
						count: settings.value.markdownCodeBlockLanguagesToLoad.length,
						interpolation: { escapeValue: false },
					}))
					.addButton(button => {
						button
							.setIcon(i18n.t(`asset:${pf}-edit-icon`))
							.setTooltip(i18n.t(`${pf}-edit`))
							.onClick(() => {
								new ListModal(
									context,
									ListModal.stringInputter<string>({
										back: identity,
										forth: identity,
									}),
									constant(""),
									settings.value.markdownCodeBlockLanguagesToLoad,
									{
										callback: async (value): Promise<void> => {
											await settings.mutate(settingsM => {
												settingsM.markdownCodeBlockLanguagesToLoad = value
											})
											this.postMutate()
										},
										description: (): string => i18n.t(`${pf}-edit-description`),
										title: (): string => i18n.t(pf),
									},
								).open()
							})
					})
					.addExtraButton(resetButton(
						i18n.t(`asset:${pf}-icon`),
						i18n.t("settings.reset"),
						async () => settings.mutate(settingsM => {
							settingsM.markdownCodeBlockLanguagesToLoad =
								cloneAsWritable(
									Settings.DEFAULT.markdownCodeBlockLanguagesToLoad,
								)
						}),
						() => { this.postMutate() },
					))
			})
			.newSetting(containerEl, setting => {
				const { settingEl } = setting,
					pf = "settings.import-timeout"
				setting
					.setName(createDocumentFragment(settingEl.ownerDocument, frag => {
						createChildElement(frag, "span", ele => {
							ele.innerHTML = i18n.t(`${pf}-HTML`)
						})
					}))
					.setDesc(createDocumentFragment(settingEl.ownerDocument, frag => {
						createChildElement(frag, "span", ele => {
							ele.innerHTML = i18n.t(`${pf}-description-HTML`)
						})
					}))
					.addText(linkSetting(
						() => settings.value.importTimeout.toString(),
						setTextToNumber(async value => settings.mutate(settingsM => {
							settingsM.importTimeout = value
						})),
						() => { this.postMutate() },
					))
					.addExtraButton(resetButton(
						i18n.t(`asset:${pf}-icon`),
						i18n.t("settings.reset"),
						async () => settings.mutate(settingsM => {
							settingsM.importTimeout = Settings.DEFAULT.importTimeout
						}),
						() => { this.postMutate() },
					))
			})
		this.newSectionWidget(() => i18n.t("settings.startup-modules"))
		ui
			.newSetting(containerEl, setting => {
				const pf = "settings.startup-modules"
				setting
					.setName(i18n.t(pf))
					.setDesc(i18n.t(`${pf}-description`, {
						count: settings.value.startupModules.length,
						interpolation: { escapeValue: false },
					}))
					.addButton(button => {
						button
							.setIcon(i18n.t(`asset:${pf}-edit-icon`))
							.setTooltip(i18n.t(`${pf}-edit`))
							.onClick(() => {
								new ListModal(
									context,
									ListModal.stringInputter<string>({
										back: identity,
										forth: identity,
									}),
									constant(""),
									settings.value.startupModules,
									{
										callback: async (value): Promise<void> => {
											await settings.mutate(settingsM => {
												settingsM.startupModules = value
											})
											this.postMutate()
										},
										description: (): string => i18n.t(`${pf}-edit-description`),
										title: (): string => i18n.t(pf),
									},
								).open()
							})
					})
					.addExtraButton(resetButton(
						i18n.t(`asset:${pf}-icon`),
						i18n.t("settings.reset"),
						async () => settings.mutate(settingsM => {
							settingsM.startupModules =
								cloneAsWritable(Settings.DEFAULT.startupModules)
						}),
						() => { this.postMutate() },
					))
			})
			.newSetting(containerEl, setting => {
				setting
					.setName(i18n.t("settings.auto-reload-startup-modules"))
					.setDesc(i18n.t("settings.auto-reload-startup-modules-description"))
					.addToggle(linkSetting(
						() => settings.value.autoReloadStartupModules,
						async value => settings.mutate(settingsM => {
							settingsM.autoReloadStartupModules = value
						}),
						() => { this.postMutate() },
					))
					.addExtraButton(resetButton(
						i18n.t("asset:settings.auto-reload-startup-modules-icon"),
						i18n.t("settings.reset"),
						async () => settings.mutate(settingsM => {
							settingsM.autoReloadStartupModules =
								Settings.DEFAULT.autoReloadStartupModules
						}),
						() => { this.postMutate() },
					))
			})
		this.newSectionWidget(() => i18n.t("settings.interface"))
		ui.newSetting(containerEl, setting => {
			setting
				.setName(i18n.t("settings.open-changelog-on-update"))
				.addToggle(linkSetting(
					() => settings.value.openChangelogOnUpdate,
					async value => settings.mutate(settingsM => {
						settingsM.openChangelogOnUpdate = value
					}),
					() => { this.postMutate() },
				))
				.addExtraButton(resetButton(
					i18n.t("asset:settings.open-changelog-on-update-icon"),
					i18n.t("settings.reset"),
					async () => settings.mutate(settingsM => {
						settingsM.openChangelogOnUpdate =
							Settings.DEFAULT.openChangelogOnUpdate
					}),
					() => { this.postMutate() },
				))
		})
		this.newNoticeTimeoutWidget(Settings.DEFAULT)
	}

  protected override snapshot0(): Partial<Settings> {
    return Settings.persistent(this.context.settings.value);
  }
}

export function loadSettings(
  context: ModulesPlugin,
  docs: loadDocumentations.Loaded,
): void {
  context.addSettingTab(new SettingTab(context, docs));
  registerSettingsCommands(context);
}
