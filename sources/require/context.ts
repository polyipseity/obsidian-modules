import {
	type MarkdownFileInfo,
	MarkdownPreviewRenderer,
	editorInfoField,
} from "obsidian"
import { isUndefined, noop } from "lodash-es"
import { EditorView } from "@codemirror/view"
import type { ModulesPlugin } from "../main.js"
import type { StateField } from "@codemirror/state"
import { around } from "monkey-around"
import { getWD } from "./resolve.js"
import { revealPrivate } from "@polyipseity/obsidian-plugin-library"

export function patchContextForPreview(context: ModulesPlugin): void {
	revealPrivate(context, [MarkdownPreviewRenderer.prototype], rend => {
		context.register(around(rend, {
			onRender(proto) {
				return function fn(
					this: typeof rend,
					...args: Parameters<typeof proto>
				): ReturnType<typeof proto> {
					const { api: { requires } } = context,
						req = requires.get(self),
						{ path } = this.owner.file
					req?.context.cwds.push(getWD(path))
					try {
						proto.apply(this, args)
					} finally {
						// Runs after all microtasks are done
						self.setTimeout(() => { req?.context.cwds.pop() }, 0)
					}
				}
			},
		}))
	}, noop)
}

export function patchContextForEditor(context: ModulesPlugin): void {
	context.register(around(EditorView.prototype, {
		update(proto) {
			return function fn(
				this: typeof EditorView.prototype,
				...args: Parameters<typeof proto>
			): ReturnType<typeof proto> {
				const { api: { requires } } = context,
					req = requires.get(self),
					path = this.state.field(
						// Typing bug
						editorInfoField as StateField<MarkdownFileInfo>,
						false,
					)?.file?.path
				if (!isUndefined(path)) { req?.context.cwds.push(getWD(path)) }
				try {
					proto.apply(this, args)
				} finally {
					if (!isUndefined(path)) {
						// Runs after all microtasks are done
						self.setTimeout(() => { req?.context.cwds.pop() }, 0)
					}
				}
			}
		},
	}))
}
