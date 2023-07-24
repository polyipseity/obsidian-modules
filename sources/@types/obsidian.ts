/* eslint-disable @typescript-eslint/no-empty-interface */
declare module "obsidian" {
	interface MarkdownPreviewRenderer
		extends Private<$MarkdownPreviewRenderer, PrivateKey> { }
}
import type { MarkdownPreviewView } from "obsidian"
import type { Private } from "@polyipseity/obsidian-plugin-library"

declare const PRIVATE_KEY: unique symbol
type PrivateKey = typeof PRIVATE_KEY
declare module "@polyipseity/obsidian-plugin-library" {
	interface PrivateKeys {
		readonly [PRIVATE_KEY]: never
	}
}

interface $MarkdownPreviewRenderer {
	readonly owner: MarkdownPreviewView
	readonly onRender: () => void
}
