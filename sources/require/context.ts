import {
	type MarkdownFileInfo,
	MarkdownPreviewRenderer,
	editorInfoField,
} from "obsidian"
import {
	patchPlugin,
	revealPrivate,
} from "@polyipseity/obsidian-plugin-library"
import { EditorView } from "@codemirror/view"
import type { ModulesPlugin } from "../main.js"
import type { StateField } from "@codemirror/state"
import { around } from "monkey-around"
import { noop } from "lodash-es"

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

export async function patchContextForTemplater(
	context: ModulesPlugin,
): Promise<void> {
	context.register(await patchPlugin(context, "templater-obsidian", plugin => {
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
	}))
}
