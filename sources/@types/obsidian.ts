/* eslint-disable @typescript-eslint/no-empty-interface */
declare module "obsidian" {
	interface App extends Private<$App, PrivateKey> { }
	interface MarkdownPreviewRenderer
		extends Private<$MarkdownPreviewRenderer, PrivateKey> { }
	interface Plugins extends Private<$Plugins, PrivateKey> { }
}
import type { MarkdownFileInfo, Plugin, Plugins } from "obsidian"
import type { Private } from "@polyipseity/obsidian-plugin-library"
import type { TemplaterPlugin } from "templater-obsidian"

declare const PRIVATE_KEY: unique symbol
type PrivateKey = typeof PRIVATE_KEY
declare module "@polyipseity/obsidian-plugin-library" {
	interface PrivateKeys {
		readonly [PRIVATE_KEY]: never
	}
}

interface $App {
	readonly plugins: Plugins
}

interface $MarkdownPreviewRenderer {
	readonly owner: MarkdownFileInfo
	readonly onRender: () => void
}

interface $Plugins {
	readonly getPlugin: <const I extends string>(id: I) => $Plugins.Map[I] | null
	readonly loadPlugin: <const I extends string>(
		id: I,
	) => PromiseLike<$Plugins.Map[I] | null>
}
namespace $Plugins {
	export interface Map {
		readonly [_: string]: Plugin
		// eslint-disable-next-line @typescript-eslint/naming-convention
		readonly "templater-obsidian": TemplaterPlugin
	}
}
