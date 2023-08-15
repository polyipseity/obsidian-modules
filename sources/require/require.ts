import {
	type AnyObject,
	Functions,
	aroundIdentityFactory,
	assignExact,
	attachFunctionSourceMap,
	attachSourceMap,
	launderUnchecked,
	patchWindows,
} from "@polyipseity/obsidian-plugin-library"
import {
	CompositeResolve,
	ExternalResolve,
	InternalModulesResolve,
	MarkdownLinkResolve,
	RelativePathResolve,
	VaultPathResolve,
	WikilinkResolve,
} from "./resolve.js"
import type {
	Context,
	ImportOptions,
	ModuleCache,
	Require,
	RequireOptions,
	Resolve,
	Resolved,
} from "obsidian-modules"
import { MarkdownTranspile, TypeScriptTranspile } from "./transpile.js"
import { constant, isObject, isUndefined, noop } from "lodash-es"
import {
	patchContextForEditor,
	patchContextForPreview,
	patchContextForTemplater,
} from "./context.js"
import type { ModulesPlugin } from "../main.js"
import { around } from "monkey-around"
import { parse } from "acorn"

export const REQUIRE_TAG = Symbol("require tag")

export function loadRequire(context: ModulesPlugin): void {
	const { app: { workspace } } = context,
		transpiles = [
			new MarkdownTranspile(context),
			new TypeScriptTranspile(context),
		],
		resolve = new CompositeResolve([
			new InternalModulesResolve(context),
			new RelativePathResolve(context, transpiles),
			new VaultPathResolve(context, transpiles),
			new WikilinkResolve(context, transpiles),
			new MarkdownLinkResolve(context, transpiles),
			new ExternalResolve(context),
		])
	context.register(patchWindows(workspace, self0 =>
		patchRequire(context, self0, resolve)))
	patchContextForPreview(context)
	patchContextForEditor(context)
	patchContextForTemplater(context)
}

function createRequire(
	self0: typeof globalThis,
	resolve: Resolve,
	sourceRoot = "",
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
			{ cwds, parent } = context
		cleanup.push(() => { assignExact(context, "parent", parent) })
		context.parent = identity
		cwds.push(cwd)
		cleanup.push(() => { cwds.pop() })
	}
	const ret: Require = Object.assign((id0: string, opts?: RequireOptions) => {
		const cleanup = new Functions({ async: false, settled: true })
		try {
			const { context, context: { cwds }, resolve: resolve1 } = ret,
				cwd = opts?.cwd
			if (!isUndefined(cwd)) {
				cwds.push(cwd)
				cleanup.push(() => cwds.pop())
			}
			const [rd, cache] = resolve0(ret, id0, resolve1.resolve(id0, context)),
				{ code, id, value } = rd
			depends(rd, context)
			if ("commonJS" in cache) { return cache.commonJS }
			if ("value" in rd) {
				cache0(cache, "commonJS", constant(value))
				return value
			}
			const module = {
				exports: {
					[Symbol.toStringTag]: "Module",
				},
			}
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
				new self0.Function("module", "exports", attachFunctionSourceMap(
					self0.Function,
					`"use strict";${code}`,
					{
						deletions: [..."\"use strict\";"].map((_0, idx) => ({
							column: idx,
							line: 1,
						})),
						file: id,
						sourceRoot: `${sourceRoot}${sourceRoot && "/"}${id}`,
					},
				))(
					module,
					module.exports,
				)
				const { exports } = module
				exports[Symbol.toStringTag] = "Module"
				return exports
			} catch (error) {
				cache0(cache, "commonJS", () => { throw error })
				throw error
			}
		} finally {
			cleanup.call()
		}
	}, {
		[REQUIRE_TAG]: true,
		cache: new WeakMap(),
		context: {
			cwds: [],
			dependencies: new WeakMap(),
		},
		async import(id0: string, opts?: ImportOptions) {
			const cleanup = new Functions({ async: false, settled: true })
			try {
				const { context, context: { cwds }, resolve: resolve1 } = ret,
					cwd = opts?.cwd
				if (!isUndefined(cwd)) {
					cwds.push(cwd)
					cleanup.push(() => { cwds.pop() })
				}
				const
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
				cache0(cache, key, () => { throw new Error(id) })
				try {
					preload(cleanup, rd, context)
					const prefix =
						key === "esModuleWithCommonJS"
							? [
								"export let module={exports:{[Symbol.toStringTag]:\"Module\"}}",
								"let{exports}=module",
								"",
							].join(";")
							: "",
						url = URL.createObjectURL(new Blob(
							[
								attachSourceMap(
									`${prefix}${code}`,
									{
										deletions: [...prefix].map((_0, idx) => ({
											column: idx,
											line: 1,
										})),
										file: id,
										sourceRoot: `${sourceRoot}${sourceRoot && "/"}${id}`,
									},
								),
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
							exports: {
								[Symbol.toStringTag]?: "Module"
							} = isObject(exports0) ? exports0 : {},
							functions = new Map()
						exports[Symbol.toStringTag] = "Module"
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
									ret3 = void 0
								}
								return ret3 ??
									Reflect.getOwnPropertyDescriptor(target, property)
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
				}
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
	const { settings } = context
	let destroyer = noop
	const functions = new Functions({ async: false, settled: true })
	try {
		functions.push(() => { destroyer() })
		destroyer =
			createAndSetRequire(context, self0, settings.value.requireName, resolve)
		functions.push(settings.onMutate(
			set => set.requireName,
			cur => {
				destroyer()
				destroyer = createAndSetRequire(context, self0, cur, resolve)
			},
		))
		return () => { functions.call() }
	} catch (error) {
		functions.call()
		throw error
	}
}

function createAndSetRequire(
	context: ModulesPlugin,
	self0: typeof globalThis,
	name: string,
	resolve: Resolve,
): () => void {
	const { api: { requires }, manifest: { id } } = context,
		req = createRequire(self0, resolve, `plugin:${id}`)
	requires.set(self0, req)
	if (name in self0 || name === "require") {
		return around(self0, {
			require(proto) {
				return Object.assign(function fn(
					this: typeof self0 | undefined,
					...args: Parameters<typeof proto>
				): ReturnType<typeof proto> {
					try {
						const args2 = [...args]
						// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
						if (args2[1]) { args2[1] = Object.assign(() => { }, args2[1]) }
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
	try {
		Object.defineProperty(self0, name, {
			configurable: true,
			enumerable: true,
			value: req,
			writable: false,
		})
		return () => {
			if (Reflect.get(self0, name, self0) === req) {
				Reflect.deleteProperty(self0, name)
			}
		}
	} catch (error) {
		self0.console.error(error)
		return createAndSetRequire(context, self0, "require", resolve)
	}
}
