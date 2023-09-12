/* eslint-disable @typescript-eslint/no-empty-interface */
declare module "obsidian" {
	interface MarkdownPreviewRenderer
		extends Private<$MarkdownPreviewRenderer, PrivateKey> { }
	namespace Plugins {
		interface Mapping {
			// eslint-disable-next-line @typescript-eslint/naming-convention
			readonly "templater-obsidian": TemplaterPlugin
		}
	}
}
import type { MarkdownFileInfo } from "obsidian"
import type { Private } from "@polyipseity/obsidian-plugin-library"
import type { TemplaterPlugin } from "templater-obsidian"

declare const PRIVATE_KEY: unique symbol
type PrivateKey = typeof PRIVATE_KEY
declare module "@polyipseity/obsidian-plugin-library" {
	interface PrivateKeys {
		readonly [PRIVATE_KEY]: never
	}
}

interface $MarkdownPreviewRenderer {
	readonly owner: MarkdownFileInfo
	readonly onRender: () => void
}
