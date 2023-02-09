import {
	ConsolePseudoterminal,
	Pseudoterminal,
	type ShellPseudoterminalArguments,
	TextPseudoterminal,
} from "./pseudoterminal"
import { Direction, type Params } from "../components/find"
import {
	DisposerAddon,
	RendererAddon,
	XtermTerminalEmulator,
} from "./emulator"
import {
	ItemView,
	type Menu,
	type ViewStateResult,
	type WorkspaceLeaf,
} from "obsidian"
import {
	type NonReadonly,
	PLATFORM,
	UnnamespacedID,
	anyToError,
	basename,
	extname,
	inSet,
	isInterface,
	notice2,
	onVisible,
	openExternal,
	printError,
	saveFile,
	updateDisplayText,
} from "../utils/util"
import { CanvasAddon } from "xterm-addon-canvas"
import FindComponent from "../components/find.svelte"
import { LigaturesAddon } from "xterm-addon-ligatures"
import { SearchAddon } from "xterm-addon-search"
import { Settings } from "sources/settings/data"
import { TERMINAL_EXIT_SUCCESS } from "../magic"
import type { TerminalPlugin } from "../main"
import { Unicode11Addon } from "xterm-addon-unicode11"
import { WebLinksAddon } from "xterm-addon-web-links"
import { WebglAddon } from "xterm-addon-webgl"

export class TerminalView extends ItemView {
	public static readonly type = new UnnamespacedID("terminal")
	public static namespacedViewType: string
	#emulator0: TerminalView.EMULATOR | null = null
	#find0: FindComponent | null = null
	#focus0 = false
	readonly #state: TerminalView.State = {
		__type: TerminalView.State.TYPE,
		cwd: "",
		profile: Settings.Profile.DEFAULTS.invalid,
	}

	public constructor(
		protected readonly plugin: TerminalPlugin,
		leaf: WorkspaceLeaf,
	) {
		super(leaf)
	}

	get #emulator(): TerminalView.EMULATOR | null {
		return this.#emulator0
	}

	get #profile(): Settings.Profile {
		return this.#state.profile
	}

	get #find(): FindComponent | null {
		return this.#find0
	}

	get #focus(): boolean {
		return this.#focus0
	}

	set #emulator(val: TerminalView.EMULATOR | null) {
		const { plugin } = this
		this.#emulator0?.close().catch(error => {
			printError(
				anyToError(error),
				() => plugin.language
					.i18n.t("errors.failed-to-kill-pseudoterminal"),
				plugin,
			)
		})
		this.#emulator0 = val
		if (val === null) { return }
		const { terminal } = val
		if (this.#focus) { terminal.focus() } else { terminal.blur() }
	}

	set #find(val: FindComponent | null) {
		this.#find?.$destroy()
		this.#find0 = val
	}

	set #focus(val: boolean) {
		const term = this.#emulator?.terminal
		if (val) { term?.focus() } else { term?.blur() }
		this.#focus0 = val
	}

	set #profile(value: Settings.Profile) {
		this.#state.profile = value
		this.#emulator = null
	}

	public override async setState(
		state: unknown,
		result: ViewStateResult,
	): Promise<void> {
		await super.setState(state, result)
		if (isInterface<TerminalView.State>(TerminalView.State.TYPE, state)) {
			Object.assign(this.#state, state)
		}
	}

	public override getState(): unknown {
		const serial = this.#emulator?.serialize()
		if (typeof serial !== "undefined") {
			this.#state.serial = serial
		}
		return Object.assign(super.getState(), this.#state)
	}

	public override onResize(): void {
		super.onResize()
		const { containerEl } = this
		if (containerEl.offsetWidth <= 0 || containerEl.offsetHeight <= 0) {
			return
		}
		this.#emulator?.resize(false).catch(error => { console.warn(error) })
	}

	public getDisplayText(): string {
		return this.plugin.language
			.i18n.t(
				`components.${TerminalView.type.id}.display-name`,
				{ executable: this.#displayName() },
			)
	}

	public override getIcon(): string {
		return this.plugin.language
			.i18n.t(`asset:components.${TerminalView.type.id}.icon`)
	}

	public getViewType(): string {
		// Workaround: super() calls this method
		return TerminalView.namespacedViewType
	}

	public override onPaneMenu(menu: Menu, source: string): void {
		super.onPaneMenu(menu, source)
		const { plugin, containerEl, contentEl } = this,
			{ i18n } = plugin.language
		menu
			.addSeparator()
			.addItem(item => item
				.setTitle(i18n.t("menus.terminal.find"))
				.setIcon(i18n.t("asset:menus.terminal.find-icon"))
				.setDisabled(this.#find !== null)
				.onClick(() => {
					const
						find = (
							direction: Direction,
							params: Params,
							incremental = false,
						): void => {
							const finder = this.#emulator?.addons.search
							if (typeof finder === "undefined") { return }
							const func = direction === Direction.next
								? finder.findNext.bind(finder)
								: finder.findPrevious.bind(finder)
							func(
								params.findText,
								{
									caseSensitive: params.caseSensitive,
									decorations: {
										activeMatchColorOverviewRuler: "#00000000",
										matchOverviewRuler: "#00000000",
									},
									incremental,
									regex: params.regex,
									wholeWord: params.wholeWord,
								},
							)
							if (params.findText === "") {
								this.#find?.$set({ searchResult: "" })
							}
						}
					this.#find = new FindComponent({
						anchor: contentEl,
						intro: true,
						props: {
							i18n: i18n.t,
							onClose: (): void => { this.#find = null },
							onFind: find,
							onParamsChanged: (params: Params): void => {
								this.#emulator?.addons.search.clearDecorations()
								find(Direction.previous, params)
							},
						},
						target: containerEl,
					})
				}))
			.addItem(item => item
				.setTitle(i18n.t("menus.terminal.restart"))
				.setIcon(i18n.t("asset:menus.terminal.restart-icon"))
				.onClick(() => { this.#startEmulator() }))
			.addItem(item => item
				.setTitle(i18n.t("menus.terminal.save-as-HTML"))
				.setIcon(i18n.t("asset:menus.terminal.save-as-HTML-icon"))
				.setDisabled(typeof this.#emulator?.addons.serialize === "undefined")
				.onClick(() => {
					const ser = this.#emulator?.addons.serialize
					if (typeof ser === "undefined") { return }
					saveFile(
						ser.serializeAsHTML({
							includeGlobalBackground: false,
							onlySelection: false,
						}),
						"text/html; charset=UTF-8;",
						`${this.#displayName()}.html`,
					)
				}))
	}

	protected override async onOpen(): Promise<void> {
		await super.onOpen()
		const { containerEl, plugin } = this,
			{ app, language, statusBarHider } = plugin,
			{ workspace } = app
		containerEl.empty()

		this.register(language.onChangeLanguage.listen(() =>
			updateDisplayText(this)))

		this.#focus = workspace.getActiveViewOfType(TerminalView) === this
		this.registerEvent(app.workspace.on("active-leaf-change", leaf => {
			if (leaf === this.leaf) {
				this.#focus = true
				return
			}
			this.#focus = false
		}))

		this.register(statusBarHider.hide(() => this.#hidesStatusBar()))
		this.registerEvent(workspace.on(
			"active-leaf-change",
			() => { statusBarHider.update() },
		))

		this.register(() => { this.#emulator = null })
		this.#startEmulator()
	}

	#startEmulator(): void {
		this.contentEl.detach()
		this.contentEl = this.containerEl.createDiv()
		const { contentEl } = this,
			obsr = onVisible(contentEl, obsr0 => {
				try {
					const { plugin } = this,
						state = this.#state,
						{ cwd, serial } = state,
						{ app, language, settings } = plugin,
						{ i18n } = language,
						{ requestSaveLayout } = app.workspace,
						protodisposer: (() => void)[] = [],
						emulator = new TerminalView.EMULATOR(
							plugin,
							contentEl,
							terminal => {
								if (typeof serial !== "undefined") {
									terminal.write(`${i18n.t(
										"components.terminal.restored-history",
										{ time: new Date().toLocaleString(language.language) },
									)}\r\n`)
								}
								const profile = this.#profile,
									{ type } = profile
								switch (type) {
									case "": {
										return new TextPseudoterminal()
									}
									case "console": {
										return new ConsolePseudoterminal()
									}
									case "integrated": {
										if (Pseudoterminal.PLATFORM_PSEUDOTERMINAL === null) {
											break
										}
										const
											{
												args,
												platforms,
												enableWindowsConhostWorkaround,
												executable,
												pythonExecutable,
											} = profile,
											platforms0: Readonly<Record<string, boolean>> = platforms
										if (!(platforms0[PLATFORM] ?? false)) { break }
										const ptyArgs: NonReadonly<ShellPseudoterminalArguments> = {
											args,
											cwd,
											executable,
										}
										if (typeof enableWindowsConhostWorkaround !== "undefined") {
											ptyArgs.enableWindowsConhostWorkaround =
												enableWindowsConhostWorkaround
										}
										if (typeof pythonExecutable !== "undefined") {
											ptyArgs.pythonExecutable = pythonExecutable
										}
										return new Pseudoterminal
											.PLATFORM_PSEUDOTERMINAL(plugin, ptyArgs)
									}
									case "external":
									// Fallthrough
									case "invalid": {
										break
									}
									default:
										throw new TypeError(type)
								}
								const pty = new TextPseudoterminal(i18n
									.t("components.terminal.unsupported-profile", {
										profile: JSON.stringify(profile),
									}))
								protodisposer.push(language.onChangeLanguage.listen(() => {
									pty.text =
										i18n.t("components.terminal.unsupported-profile", {
											profile: JSON.stringify(profile),
										})
								}))
								return pty
							},
							serial,
							{
								allowProposedApi: true,
							},
							{
								disposer: new DisposerAddon(...protodisposer),
								ligatures: new LigaturesAddon({}),
								renderer: new RendererAddon(
									() => new CanvasAddon(),
									() => new WebglAddon(false),
								),
								search: new SearchAddon(),
								unicode11: new Unicode11Addon(),
								webLinks: new WebLinksAddon((_0, uri) => openExternal(uri), {}),
							},
						),
						{ pseudoterminal, terminal, addons } = emulator,
						{ disposer, renderer, search } = addons
					pseudoterminal.then(async pty0 => pty0.onExit)
						.then(code => {
							if (typeof code === "undefined") { return }
							notice2(
								() => i18n.t("notices.terminal-exited", { code }),
								inSet(TERMINAL_EXIT_SUCCESS, code)
									? settings.noticeTimeout
									: settings.errorNoticeTimeout,
								plugin,
							)
						}, error => {
							printError(anyToError(error), () =>
								i18n.t("errors.error-spawning-terminal"), plugin)
						})
					terminal.onWriteParsed(requestSaveLayout)
					terminal.onResize(requestSaveLayout)
					terminal.unicode.activeVersion = "11"
					disposer.push(plugin.on(
						"mutate-settings",
						settings0 => settings0.preferredRenderer,
						cur => { renderer.use(cur) },
					))
					renderer.use(settings.preferredRenderer)
					disposer.push(() => { this.#find?.$set({ searchResult: "" }) })
					search.onDidChangeResults(results => {
						if (typeof results === "undefined") {
							this.#find?.$set({
								searchResult: i18n.t("components.find.too-many-search-results"),
							})
							return
						}
						const { resultIndex, resultCount } = results
						this.#find?.$set({
							searchResult: i18n.t("components.find.search-results", {
								replace: {
									count: resultCount,
									index: resultIndex + 1,
								},
							}),
						})
					})
					emulator.resize().catch(error => { console.warn(error) })
					this.#emulator = emulator
				} finally {
					obsr0.disconnect()
				}
			})
		this.register(() => { obsr.disconnect() })
	}

	#displayName(): string {
		const { profile } = this.#state
		if ("executable" in profile) {
			const { executable } = profile
			if (typeof executable === "string") {
				return basename(executable, extname(executable))
			}
		}
		if ("name" in profile) {
			const { name } = profile
			if (typeof name === "string") { return name }
		}
		return this.plugin.language.i18n
			.t("components.terminal.unknown-profile-name")
	}

	#hidesStatusBar(): boolean {
		switch (this.plugin.settings.hideStatusBar) {
			case "focused":
				return this.#focus
			case "running":
				return true
			default:
				return false
		}
	}
}
export namespace TerminalView {
	export const EMULATOR = XtermTerminalEmulator<Addons>
	export type EMULATOR = XtermTerminalEmulator<Addons>
	export interface Addons {
		readonly disposer: DisposerAddon
		readonly ligatures: LigaturesAddon
		readonly renderer: RendererAddon
		readonly search: SearchAddon
		readonly unicode11: Unicode11Addon
		readonly webLinks: WebLinksAddon
	}
	export interface State {
		readonly __type: typeof State.TYPE
		cwd: string
		profile: Settings.Profile
		serial?: XtermTerminalEmulator.State
	}
	export namespace State {
		export const TYPE = "8d54e44a-32e7-4297-8ae2-cff88e92ce28"
	}
}
