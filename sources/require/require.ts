import {
	type AnyObject,
	aroundIdentityFactory,
	launderUnchecked,
	patchWindows,
} from "@polyipseity/obsidian-plugin-library"
import {
	CompositeResolve,
	InternalModulesResolve,
	MarkdownLinkResolve,
	RelativePathResolve,
	VaultPathResolve,
	WikilinkResolve,
} from "./resolve.js"
import type {
	ImportOptions,
	ModuleCache,
	Require,
	Resolve,
	Resolved,
} from "obsidian-modules"
import { constant, isObject } from "lodash-es"
import type { ModulesPlugin } from "../main.js"
import { around } from "monkey-around"
import { parse } from "acorn"

export function loadRequire(context: ModulesPlugin): void {
	const { app: { workspace } } = context,
		resolve = new CompositeResolve([
			new InternalModulesResolve(context),
			new RelativePathResolve(context),
			new VaultPathResolve(context),
			new WikilinkResolve(context),
			new MarkdownLinkResolve(context),
		])
	context.register(patchWindows(workspace, self0 =>
		patchRequire(context, self0, resolve)))
}

function createRequire(
	self0: typeof globalThis,
	resolve: Resolve,
): Require {
	function resolve0(
		self1: Require,
		id: string,
	): readonly [Resolved, ModuleCache] {
		const rd = self1.resolve.resolve(id)
		if (!rd) { throw new Error(id) }
		const { identity } = rd
		let cache = self1.cache.get(identity)
		if (!cache) { self1.cache.set(identity, cache = {}) }
		return [rd, cache]
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
	const ret = Object.assign((id0: string) => {
		const [rd, cache] = resolve0(ret, id0),
			{ code, value } = rd
		if ("commonJS" in cache) { return cache.commonJS }
		if ("value" in rd) {
			cache0(cache, "commonJS", constant(value))
			return value
		}
		const module = { exports: {} }
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
			new self0.Function("module", "exports", `"use strict"; ${code}`)(
				module,
				module.exports,
			)
			return module.exports
		} catch (error) {
			cache0(cache, "commonJS", () => { throw error })
			throw error
		}
	}, {
		cache: new WeakMap(),
		async import(this: Require, id0: string, opts?: ImportOptions) {
			const [rd, cache] = resolve0(this, id0),
				{ code, id, value } = rd,
				key = `esModule${opts?.commonJSInterop ?? true
					? "WithCommonJS"
					: ""}` as const
			if (key in cache) { return cache[key] }
			if ("value" in rd) {
				cache0(cache, key, constant(value))
				return value
			}
			cache0(cache, key, () => { throw new Error(id) })
			const url = URL.createObjectURL(new Blob(
				[
					`${key === "esModuleWithCommonJS"
						? "export let module = { exports: {} }; let { exports } = module; "
						: ""}${code}`,
				],
				{ type: "text/javascript" },
			))
			try {
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
				URL.revokeObjectURL(url)
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
			}, req, proto)
		},
		toString: aroundIdentityFactory(),
	})
}
