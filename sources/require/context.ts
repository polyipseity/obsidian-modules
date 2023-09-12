import {
	type MarkdownFileInfo,
	MarkdownPreviewRenderer,
	editorInfoField,
} from "obsidian"
import { EditorView } from "@codemirror/view"
import type { ModulesPlugin } from "../main.js"
import type { StateField } from "@codemirror/state"
import type { TemplaterPlugin } from "templater-obsidian"
import { around } from "monkey-around"
import { noop } from "lodash-es"
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
						path = this.owner.file?.parent?.path
					if (path !== void 0) { req?.context.cwds.push(path) }
					try {
						proto.apply(this, args)
					} finally {
						if (path !== void 0) {
							// Runs after all microtasks are done
							self.setTimeout(() => { req?.context.cwds.pop() }, 0)
						}
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
					)?.file?.parent?.path
				if (path !== void 0) { req?.context.cwds.push(path) }
				try {
					proto.apply(this, args)
				} finally {
					if (path !== void 0) {
						// Runs after all microtasks are done
						self.setTimeout(() => { req?.context.cwds.pop() }, 0)
					}
				}
			}
		},
	}))
}

export function patchContextForTemplater(context: ModulesPlugin): void {
	function patch(plugin: TemplaterPlugin): void {
		const { templater: { parser } } = plugin
		plugin.register(around(parser, {
			// eslint-disable-next-line @typescript-eslint/naming-convention, camelcase
			parse_commands(proto) {
				return async function fn(
					this: typeof parser,
					...args: Parameters<typeof proto>
				): Promise<Awaited<ReturnType<typeof proto>>> {
					const { api: { requires } } = context,
						req = requires.get(self),
						[, tp] = args
					req?.context.cwds.push(tp.file.folder(true))
					try {
						return await proto.apply(this, args)
					} finally {
						req?.context.cwds.pop()
					}
				}
			},
		}))
	}
	revealPrivate(context, [context.app], app2 => {
		const { plugins } = app2
		context.register(around(plugins, {
			loadPlugin(proto) {
				return async function fn(
					this: typeof plugins,
					...args: Parameters<typeof proto>
				): Promise<Awaited<ReturnType<typeof proto>>> {
					const ret = await proto.apply(this, args)
					try {
						const [id] = args
						if (ret && id === "templater-obsidian") {
							type Proto = typeof proto<typeof id>
							const ret2 = ret as NonNullable<Awaited<ReturnType<Proto>>>
							patch(ret2)
						}
					} catch (error) {
						self.console.error(error)
					}
					return ret
				}
			},
		}))
		const tp = plugins.getPlugin("templater-obsidian")
		if (tp) { patch(tp) }
	}, noop)
}
