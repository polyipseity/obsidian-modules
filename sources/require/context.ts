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
			onRender(next) {
				return function fn(
					this: typeof rend,
					...args: Parameters<typeof next>
				): ReturnType<typeof next> {
					const { api: { requires } } = context,
						req = requires.get(self)
					req?.context.cwds.push(this.owner.file?.parent?.path ?? null)
					try {
						next.apply(this, args)
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
		update(next) {
			return function fn(
				this: typeof EditorView.prototype,
				...args: Parameters<typeof next>
			): ReturnType<typeof next> {
				const { api: { requires } } = context,
					req = requires.get(self)
				req?.context.cwds.push(this.state.field(
					// Typing bug
					editorInfoField as StateField<MarkdownFileInfo>,
					false,
				)?.file?.parent?.path ?? null)
				try {
					next.apply(this, args)
				} finally {
					// Runs after all microtasks are done
					self.setTimeout(() => { req?.context.cwds.pop() }, 0)
				}
			}
		},
	}))
}

export function patchContextForTemplater(context: ModulesPlugin): void {
	function patch(plugin: TemplaterPlugin): void {
		const { templater: {
			// eslint-disable-next-line @typescript-eslint/naming-convention, camelcase
			functions_generator: { user_functions: { user_script_functions } },
			parser,
		} } = plugin
		plugin.register(around(parser, {
			// eslint-disable-next-line @typescript-eslint/naming-convention, camelcase
			parse_commands(next) {
				return async function fn(
					this: typeof parser,
					...args: Parameters<typeof next>
				): Promise<Awaited<ReturnType<typeof next>>> {
					const { api: { requires } } = context,
						req = requires.get(self),
						[, tp] = args
					req?.context.cwds.push(tp.config.template_file?.parent?.path ?? null)
					try {
						return await next.apply(this, args)
					} finally {
						req?.context.cwds.pop()
					}
				}
			},
		}))
		plugin.register(around(user_script_functions, {
			// eslint-disable-next-line @typescript-eslint/naming-convention, camelcase
			load_user_script_function(next) {
				return async function fn(
					// eslint-disable-next-line camelcase
					this: typeof user_script_functions,
					...args: Parameters<typeof next>
				): Promise<Awaited<ReturnType<typeof next>>> {
					const { api: { requires } } = context,
						req = requires.get(self),
						[file] = args
					req?.context.cwds.push(file.parent?.path ?? null)
					try {
						await next.apply(this, args)
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
			loadPlugin(next) {
				return async function fn(
					this: typeof plugins,
					...args: Parameters<typeof next>
				): Promise<Awaited<ReturnType<typeof next>>> {
					const ret = await next.apply(this, args)
					try {
						const [id] = args
						if (ret && id === "templater-obsidian") {
							type Proto = typeof next<typeof id>
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
