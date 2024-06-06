import {
	type CanvasNodeInfo,
	Component,
	type MarkdownFileInfo,
	MarkdownPreviewRenderer,
	editorInfoField,
} from "obsidian"
import {
	Functions,
	patchPlugin,
	revealPrivate,
	sleep2,
} from "@polyipseity/obsidian-plugin-library"
import { constant, noop } from "lodash-es"
import { EditorView } from "@codemirror/view"
import type { ModulesPlugin } from "../main.js"
import type { StateField } from "@codemirror/state"
import { around } from "monkey-around"

export async function patchContextForDataview(
	context: ModulesPlugin,
): Promise<void> {
	const { app: { metadataCache }, api: { requires } } = context
	context.register(await patchPlugin(context, "dataview", plugin => {
		const comp = new Component()
		try {
			const dv = plugin.localApi("", comp, self.document.createElement("div"))
			return around(
				Object.getPrototypeOf(dv) as typeof dv,
				{
					view(next) {
						return async function fn(
							this: typeof dv,
							...args: Parameters<typeof next>
						): Promise<Awaited<ReturnType<typeof next>>> {
							const req = requires.get(self),
								{ currentFilePath } = this,
								[viewName] = args,
								file = metadataCache.getFirstLinkpathDest(
									`${viewName}.js`,
									currentFilePath,
								) ?? metadataCache.getFirstLinkpathDest(
									`${viewName}/view.js`,
									currentFilePath,
								)
							await sleep2(self, 0)
							await sleep2(self, 0)
							req?.context.cwds.push(file?.parent?.path ?? null)
							try {
								await next.apply(this, args)
							} finally {
								req?.context.cwds.pop()
							}
						}
					},
				},
			)
		} finally {
			comp.unload()
		}
	}))
}

export function patchContextForEditor(context: ModulesPlugin): void {
	const { api: { requires } } = context
	context.register(around(EditorView.prototype, {
		update(next) {
			return function fn(
				this: typeof EditorView.prototype,
				...args: Parameters<typeof next>
			): ReturnType<typeof next> {
				const req = requires.get(self),
					info = this.state.field(
						// Typing bug
						editorInfoField as unknown as StateField<MarkdownFileInfo>,
						false,
					)
				let path = info?.file?.parent?.path
				if (path === void 0 && info) {
					const info2 = info as CanvasNodeInfo | typeof info
					path = revealPrivate(context, [info2], info3 => {
						if ("node" in info3) {
							return info3.node.canvas.view.file.parent?.path
						}
						return path
					}, constant(path))
				}
				req?.context.cwds.push(path ?? null)
				try {
					next.apply(this, args)
				} finally {
					// Runs after all microtasks are done
					self.setTimeout(() => { req?.context.cwds.pop() })
				}
			}
		},
	}))
}

export function patchContextForPreview(context: ModulesPlugin): void {
	const { api: { requires } } = context
	revealPrivate(context, [MarkdownPreviewRenderer.prototype], rend => {
		context.register(around(rend, {
			onRender(next) {
				return function fn(
					this: typeof rend,
					...args: Parameters<typeof next>
				): ReturnType<typeof next> {
					const req = requires.get(self),
						{ owner } = this
					let path = owner.file?.parent?.path
					if (path === void 0 && "owner" in owner) {
						const { owner: owner2 } = owner
						if ("node" in owner2) {
							path = owner2.node.canvas.view.file.parent?.path
						}
					}
					req?.context.cwds.push(path ?? null)
					try {
						next.apply(this, args)
					} finally {
						// Runs after all microtasks are done
						self.setTimeout(() => { req?.context.cwds.pop() })
					}
				}
			},
		}))
	}, noop)
}

export async function patchContextForTemplater(
	context: ModulesPlugin,
): Promise<void> {
	const { api: { requires } } = context
	context.register(await patchPlugin(context, "templater-obsidian", plugin => {
		const ret = new Functions({ async: false, settled: true })
		try {
			const { templater: {
				// eslint-disable-next-line @typescript-eslint/naming-convention, camelcase
				functions_generator: { user_functions: { user_script_functions } },
				parser,
			} } = plugin
			ret.push(around(parser, {
				// eslint-disable-next-line @typescript-eslint/naming-convention, camelcase
				parse_commands(next) {
					return async function fn(
						this: typeof parser,
						...args: Parameters<typeof next>
					): Promise<Awaited<ReturnType<typeof next>>> {
						const req = requires.get(self),
							[, tp] = args
						req?.context.cwds.push(
							tp.config.template_file?.parent?.path ?? null,
						)
						try {
							return await next.apply(this, args)
						} finally {
							req?.context.cwds.pop()
						}
					}
				},
			}))
			ret.push(around(user_script_functions, {
				// eslint-disable-next-line @typescript-eslint/naming-convention, camelcase
				load_user_script_function(next) {
					return async function fn(
						// eslint-disable-next-line camelcase
						this: typeof user_script_functions,
						...args: Parameters<typeof next>
					): Promise<Awaited<ReturnType<typeof next>>> {
						const req = requires.get(self),
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
			return (): void => { ret.call() }
		} catch (error) {
			ret.call()
			throw error
		}
	}))
}
