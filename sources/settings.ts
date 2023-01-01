import {
	type ButtonComponent,
	type ExtraButtonComponent,
	PluginSettingTab,
	Setting,
	type ValueComponent,
} from "obsidian"
import { RESOURCES } from "assets/locales"
import { TerminalPlugin } from "./main"

export interface Settings {
	language: string
	command: boolean
	contextMenu: boolean
	noticeTimeout: number
	executables: Settings.Executables
}
export namespace Settings {
	export type Executables = {
		[key in TerminalPlugin.Platform]: Executables.Entry
	}
	export namespace Executables {
		export interface Entry {
			name: string
			args: string[]
		}
	}
}
export function getDefaultSettings(): Settings {
	return {
		command: true,
		contextMenu: true,
		executables: {
			darwin: {
				args: [],
				name: "Terminal.app",
			},
			linux: {
				args: [],
				name: "xterm",
			},
			win32: {
				args: [],
				name: "C:\\Windows\\System32\\cmd.exe",
			},
		},
		language: "",
		noticeTimeout: 5,
	}
}

export class SettingTab extends PluginSettingTab {
	public constructor(protected readonly plugin: TerminalPlugin) {
		super(plugin.app, plugin)
	}

	public display(): void {
		const { containerEl, plugin } = this,
			{ i18n } = plugin
		containerEl.empty()
		containerEl.createEl("h1", { text: plugin.i18n.t("name") })

		interface ComponentAction<C, V> {
			readonly pre?: (component: C) => void
			readonly post?: (
				component: C,
				activate: (value: V) => Promise<void>,
			) => void
		}
		const linkSetting = <C extends ValueComponent<V>
			& {
				onChange: (callback: (value: V) => any) => C
			}, V>(
				getter: () => V,
				setter: (value: V, component: C, getter: () => V) => any,
				action: ComponentAction<C, V> = {},
			) => (component: C) => {
				(action.pre ?? ((): void => { }))(component)
				const activate = async (value: V): Promise<void> => {
					const ret: unknown = await setter(value, component, getter)
					if (typeof ret === "boolean" && !ret) {
						return
					}
					await plugin.saveSettings()
				}
				component.setValue(getter()).onChange(activate);
				(action.post ?? ((): void => { }))(component, activate)
			},
			resetButton = <C extends ButtonComponent | ExtraButtonComponent>(
				resetter: (component: C) => any,
				icon: string = i18n.t("asset:settings.reset-icon"),
				action: ComponentAction<C, void> = {},
			) =>
				(component: C) => {
					(action.pre ?? ((): void => { }))(component)
					const activate = async (): Promise<void> => {
						const ret: unknown = await resetter(component)
						if (typeof ret === "boolean" && !ret) {
							return
						}
						const save = plugin.saveSettings()
						this.display()
						await save
					}
					component
						.setTooltip(i18n.t("settings.reset"))
						.setIcon(icon)
						.onClick(activate);
					(action.post ?? ((): void => { }))(component, activate)
				},
			textToNumberSetter = <C extends ValueComponent<string>>(
				setter: (value: number, component: C, getter: () => string) => any,
				integer = false,
			) => async (value: string, component: C, getter: () => string) => {
				const num = Number(value)
				if (integer ? Number.isSafeInteger(num) : isFinite(num)) {
					component.setValue(getter())
					return false
				}
				const ret: unknown = await setter(num, component, getter)
				if (typeof ret === "boolean" && !ret) {
					return false
				}
				return true
			}

		new Setting(containerEl)
			.setName(i18n.t("settings.language"))
			.setDesc(i18n.t("settings.language-description"))
			.addDropdown(linkSetting(
				() => plugin.settings.language,
				value => {
					plugin.settings.language = value
				},
				{
					post: (dropdown, activate) => {
						dropdown
							.onChange(async value => {
								await activate(value)
								await plugin.language.changeLanguage(value)
								this.display()
							})
					},
					pre: dropdown => {
						dropdown
							.addOption("", i18n.t("settings.language-default"))
							.addOptions(Object
								.fromEntries(Object
									.entries(RESOURCES.en.language)
									.filter(entry => entry.every(half => typeof half === "string"))))
					},
				},
			))
			.addExtraButton(resetButton(() => {
				plugin.settings.language = getDefaultSettings().language
			}, i18n.t("asset:settings.language-icon"), {
				post: (button, activate) => {
					button
						.onClick(async () => {
							await activate()
							await plugin.language.changeLanguage(plugin.settings.language)
							this.display()
						})
				},
			}))
		new Setting(containerEl)
			.setName(i18n.t("settings.reset-all"))
			.addButton(resetButton(async () => {
				Object.assign(plugin.settings, getDefaultSettings())
				await plugin.language.changeLanguage(plugin.settings.language)
			}))

		new Setting(containerEl)
			.setName(i18n.t("settings.add-to-commands"))
			.addToggle(linkSetting(
				() => plugin.settings.command,
				value => {
					plugin.settings.command = value
				},
			))
			.addExtraButton(resetButton(() => {
				plugin.settings.command = getDefaultSettings().command
			}, i18n.t("asset:settings.add-to-commands-icon")))
		new Setting(containerEl)
			.setName(i18n.t("settings.add-to-context-menus"))
			.addToggle(linkSetting(
				() => plugin.settings.contextMenu,
				value => {
					plugin.settings.contextMenu = value
				},
			))
			.addExtraButton(resetButton(() => {
				plugin.settings.contextMenu = getDefaultSettings().contextMenu
			}, i18n.t("asset:settings.add-to-context-menus-icon")))

		new Setting(containerEl)
			.setName(i18n.t("settings.notice-timeout"))
			.setDesc(i18n.t("settings.notice-timeout-description"))
			.addText(linkSetting(
				() => plugin.settings.noticeTimeout.toString(),
				textToNumberSetter(value => { plugin.settings.noticeTimeout = value }),
			))
			.addExtraButton(resetButton(() => {
				plugin.settings.noticeTimeout =
					getDefaultSettings().noticeTimeout
			}, i18n.t("asset:settings.notice-timeout-icon")))

		containerEl.createEl("h2", { text: i18n.t("settings.executables") })
		for (const key of TerminalPlugin.PLATFORMS) {
			new Setting(containerEl)
				.setName(i18n.t(`settings.executable-list.${key}`))
				.addText(linkSetting(
					() => plugin.settings.executables[key].name,
					value => {
						plugin.settings.executables[key].name = value
					},
				))
				.addExtraButton(resetButton(() => {
					plugin.settings.executables[key].name =
						getDefaultSettings().executables[key].name
				}, i18n.t("asset:settings.executable-list-icon")))
		}
	}
}
