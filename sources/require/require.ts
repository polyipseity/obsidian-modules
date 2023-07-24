import {
	type AnyObject,
	Functions,
	aroundIdentityFactory,
	assignExact,
	launderUnchecked,
	patchWindows,
	revealPrivate,
} from "@polyipseity/obsidian-plugin-library"
import {
	CompositeResolve,
	InternalModulesResolve,
	MarkdownLinkResolve,
	RelativePathResolve,
	VaultPathResolve,
	WikilinkResolve,
	getWD,
} from "./resolve.js"
import type {
	Context,
	ImportOptions,
	ModuleCache,
	Require,
	Resolve,
	Resolved,
} from "obsidian-modules"
import {
	type MarkdownFileInfo,
	MarkdownPreviewRenderer,
	editorInfoField,
} from "obsidian"
import { constant, isObject, isUndefined } from "lodash-es"
import { EditorView } from "@codemirror/view"
import { MarkdownTranspile } from "./transpile.js"
import type { ModulesPlugin } from "../main.js"
import type { StateField } from "@codemirror/state"
import { around } from "monkey-around"
import { parse } from "acorn"

export function loadRequire(context: ModulesPlugin): void {
	const { app: { workspace } } = context,
		transpiles = [new MarkdownTranspile()],
		resolve = new CompositeResolve([
			new InternalModulesResolve(context),
			new RelativePathResolve(context, transpiles),
			new VaultPathResolve(context, transpiles),
			new WikilinkResolve(context, transpiles),
			new MarkdownLinkResolve(context, transpiles),
		])
	context.register(patchWindows(workspace, self0 =>
		patchRequire(context, self0, resolve)))
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
				if (!isUndefined(path)) { req?.context.cwd.push(getWD(path)) }
				try {
					proto.apply(this, args)
				} finally {
					if (!isUndefined(path)) {
						// Runs after all microtasks are done
						self.setTimeout(() => { req?.context.cwd.pop() }, 0)
					}
				}
			}
		},
	}))
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
					req?.context.cwd.push(getWD(path))
					try {
						proto.apply(this, args)
					} finally {
						// Runs after all microtasks are done
						self.setTimeout(() => { req?.context.cwd.pop() }, 0)
					}
				}
			},
		}))
	}, () => { })
}

function createRequire(
	self0: typeof globalThis,
	resolve: Resolve,
): Require {
	function resolve0(
		self1: Require,
		id: string,
		resolved: Resolved | null,
	): readonly [Resolved, ModuleCache] {
		if (!resolved) { throw new Error(id) }
		const { identity } = resolved
		let cache = self1.cache.get(identity)
		if (!cache) { self1.cache.set(identity, cache = {}) }
		return [resolved, cache]
	}
	function cache0<T>(
		cache: ModuleCache,
		key: keyof ModuleCache,
		get: () => T,
	): void {
		Object.defineProperty(cache, key, {
			configurable: true,
			enumerable: true,
			get,
		})
	}
	function depends(resolved: Resolved, context: Context): void {
		const { identity } = resolved,
			{ parent, dependencies } = context
		if (parent) {
			let dep = dependencies.get(parent)
			if (!dep) {
				dep = new Set()
				dependencies.set(parent, dep)
			}
			dep.add(identity)
		}
	}
	function preload(
		cleanup: Functions,
		resolved: Resolved,
		context: Context,
	): void {
		const { cwd, identity } = resolved,
			{ parent } = context
		cleanup.push(() => { assignExact(context, "parent", parent) })
		context.parent = identity
		if (!isUndefined(cwd)) {
			context.cwd.push(cwd)
			cleanup.push(() => { context.cwd.pop() })
		}
	}
	const ret: Require = Object.assign((id0: string) => {
		const { context, resolve: resolve1 } = ret,
			[rd, cache] = resolve0(ret, id0, resolve1.resolve(id0, context)),
			{ code, value } = rd
		depends(rd, context)
		if ("commonJS" in cache) { return cache.commonJS }
		if ("value" in rd) {
			cache0(cache, "commonJS", constant(value))
			return value
		}
		const module = { exports: {} },
			cleanup = new Functions({ async: false, settled: true })
		cache0(cache, "commonJS", () => module.exports)
		try {
			parse(code, {
				allowAwaitOutsideFunction: false,
				allowHashBang: true,
				allowImportExportEverywhere: false,
				allowReserved: true,
				allowReturnOutsideFunction: false,
				allowSuperOutsideMethod: false,
				ecmaVersion: "latest",
				locations: false,
				preserveParens: true,
				ranges: false,
				sourceType: "script",
			})
			preload(cleanup, rd, context)
			new self0.Function("module", "exports", `"use strict"; ${code}`)(
				module,
				module.exports,
			)
			return module.exports
		} catch (error) {
			cache0(cache, "commonJS", () => { throw error })
			throw error
		} finally {
			cleanup.call()
		}
	}, {
		cache: new WeakMap(),
		context: {
			cwd: [],
			dependencies: new WeakMap(),
		},
		async import(id0: string, opts?: ImportOptions) {
			const { context, resolve: resolve1 } = ret,
				[rd, cache] = resolve0(
					ret,
					id0,
					await resolve1.aresolve(id0, context),
				),
				{ code, id, value } = rd,
				key = `esModule${opts?.commonJSInterop ?? true
					? "WithCommonJS"
					: ""}` as const
			depends(rd, context)
			if (key in cache) { return cache[key] }
			if ("value" in rd) {
				cache0(cache, key, constant(value))
				return value
			}
			const cleanup = new Functions({ async: false, settled: true })
			cache0(cache, key, () => { throw new Error(id) })
			try {
				preload(cleanup, rd, context)
				const url = URL.createObjectURL(new Blob(
					[
						key === "esModuleWithCommonJS"
							? [
								"export let module = { exports: {} }",
								"let { exports } = module",
								code,
							].join(";")
							: code,
					],
					{ type: "text/javascript" },
				))
				cleanup.push(() => { URL.revokeObjectURL(url) })
				let ret2 = await import(url) as object
				if (key === "esModuleWithCommonJS") {
					const mod = ret2,
						exports0 = launderUnchecked<AnyObject>(
							launderUnchecked<AnyObject>(mod)["module"],
						)["exports"],
						exports = isObject(exports0) ? exports0 : {},
						functions = new Map()
					ret2 = new Proxy(exports, {
						defineProperty(target, property, attributes): boolean {
							if (!(attributes.configurable ?? true) &&
								!Reflect.defineProperty(target, property, attributes)) {
								return false
							}
							return Reflect.defineProperty(mod, property, attributes)
						},
						deleteProperty(target, property): boolean {
							const own = Reflect.getOwnPropertyDescriptor(target, property)
							if (!(own?.configurable ?? true) &&
								!Reflect.deleteProperty(target, property)) {
								return false
							}
							return Reflect.deleteProperty(mod, property)
						},
						get(target, property, receiver): unknown {
							const own = Reflect.getOwnPropertyDescriptor(target, property)
							if (Reflect.has(target, property) ||
								// eslint-disable-next-line @typescript-eslint/no-extra-parens
								(!(own?.configurable ?? true) &&
									// eslint-disable-next-line @typescript-eslint/no-extra-parens
									(!(own?.writable ?? true) || (own?.set && !own.get)))) {
								return Reflect.get(target, property, receiver)
							}
							const ret3: unknown = Reflect.get(
								mod,
								property,
								receiver === target ? mod : receiver,
							)
							if (typeof ret3 === "function") {
								const ret4 = ret3
								// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
								return functions.get(ret3) ?? (() => {
									function fn(
										this: unknown,
										...args: readonly unknown[]
									): unknown {
										// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, @typescript-eslint/strict-boolean-expressions
										if (new.target) {
											return Reflect.construct(
												ret4,
												args,
												new.target === fn ? ret4 : new.target,
											)
										}
										return Reflect.apply(
											ret4,
											this === ret2 ? mod : this,
											args,
										)
									}
									functions.set(ret3, fn)
									return fn
								})()
							}
							return ret3
						},
						getOwnPropertyDescriptor(
							target,
							property,
						): PropertyDescriptor | undefined {
							let ret3 = Reflect.getOwnPropertyDescriptor(mod, property)
							if (ret3 && !(ret3.configurable ?? true) &&
								!Reflect.defineProperty(target, property, ret3)) {
								// eslint-disable-next-line no-void
								ret3 = void 0
							}
							return ret3 ?? Reflect.getOwnPropertyDescriptor(target, property)
						},
						getPrototypeOf(_0): object | null {
							return Reflect.getPrototypeOf(mod)
						},
						has(target, property): boolean {
							return Reflect.getOwnPropertyDescriptor(target, property)
								?.configurable ?? true
								? Reflect.has(mod, property) || Reflect.has(target, property)
								: Reflect.has(target, property)
						},
						isExtensible(target): boolean {
							return Reflect.isExtensible(target)
						},
						ownKeys(target): ArrayLike<string | symbol> {
							return [
								...new Set([
									Reflect.ownKeys(target),
									Reflect.ownKeys(mod),
									Reflect.ownKeys(target)
										.filter(key2 =>
											!(Reflect.getOwnPropertyDescriptor(target, key2)
												?.configurable ?? true)),
								].flat()),
							]
						},
						preventExtensions(target): boolean {
							return Reflect.preventExtensions(target)
						},
						set(target, property, newValue, receiver): boolean {
							const own = Reflect.getOwnPropertyDescriptor(target, property)
							if (!(own?.configurable ?? true) &&
								// eslint-disable-next-line @typescript-eslint/no-extra-parens
								(!(own?.writable ?? true) || (own?.get && !own.set)) &&
								!Reflect.set(target, property, newValue, receiver)) {
								return false
							} return Reflect.set(
								mod,
								property,
								newValue,
								receiver === target ? mod : receiver,
							)
						},
						setPrototypeOf(_0, proto): boolean {
							return Reflect.setPrototypeOf(mod, proto)
						},
					} satisfies Required<Omit<ProxyHandler<typeof exports
					>, "apply" | "construct">>)
				}
				cache0(cache, key, constant(ret2))
				return ret2
			} catch (error) {
				cache0(cache, key, () => { throw error })
				throw error
			} finally {
				cleanup.call()
			}
		},
		resolve,
	})
	return ret
}

function patchRequire(
	context: ModulesPlugin,
	self0: typeof globalThis,
	resolve: Resolve,
): () => void {
	const { api: { requires } } = context,
		req = createRequire(self0, resolve)
	requires.set(self0, req)
	return around(self0, {
		require(proto) {
			return Object.assign(function fn(
				this: typeof self0 | undefined,
				...args: Parameters<typeof proto>
			): ReturnType<typeof proto> {
				try {
					return proto.apply(this, args)
				} catch (error) {
					self0.console.debug(error)
					return req(...args)
				}
			}, req) as unknown as NodeRequire
		},
		toString: aroundIdentityFactory(),
	})
}
