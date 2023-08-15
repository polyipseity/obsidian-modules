import type { AsyncOrSync, Writable } from "ts-essentials"
import {
	type CodePoint,
	Rules,
	SettingRules,
	codePoint,
	dynamicRequire,
	dynamicRequireLazy,
	dynamicRequireSync,
	escapeJavaScriptString,
	importable,
} from "@polyipseity/obsidian-plugin-library"
import type { Context, Resolve, Resolved } from "obsidian-modules"
import { type Options, parse, parseExpressionAt } from "acorn"
import { TFile, getLinkpath, normalizePath, requestUrl } from "obsidian"
import type {
	Transpile,
	TypeScriptTranspile,
	WeakCacheIdentity,
} from "./transpile.js"
import { BUNDLE } from "../import.js"
import type { CallExpression } from "estree"
import type { ModulesPlugin } from "../main.js"
import { generate } from "astring"
import { simple } from "acorn-walk"

const
	tsMorphBootstrap = dynamicRequireLazy<typeof import("@ts-morph/bootstrap")
	>(BUNDLE, "@ts-morph/bootstrap")

export interface CacheIdentity {
	readonly file: TFile
	readonly content?: string
}

abstract class AbstractResolve implements Resolve {
	public constructor(
		protected readonly context: ModulesPlugin,
	) { }

	public abstract aresolve(
		// eslint-disable-next-line @typescript-eslint/no-invalid-this
		...args: Parameters<typeof this.resolve>
		// eslint-disable-next-line @typescript-eslint/no-invalid-this
	): AsyncOrSync<ReturnType<typeof this.resolve>>
	public abstract resolve(id: string, context: Context): Resolved | null
}

abstract class AbstractFileResolve
	extends AbstractResolve
	implements Resolve {
	public static readonly globalCache = new WeakSet()
	protected readonly preloadRules
	protected readonly transpiles
	protected readonly cache0: Record<string, CacheIdentity> = {}
	protected readonly transpiled =
		new WeakMap<Transpile, WeakSet<CacheIdentity>>()

	protected readonly atranspiled =
		new WeakMap<Transpile, WeakSet<CacheIdentity>>()

	public constructor(
		context: ModulesPlugin,
		transpiles: readonly Transpile[],
	) {
		super(context)
		this.preloadRules = new SettingRules(
			context,
			set => set.preloadingRules,
			Rules.pathInterpreter,
		)
		this.transpiles = Object.freeze([...transpiles])
		const
			{
				cache0,
				context: { app: { vault } },
				transpiled,
				preloadRules,
			} = this,
			preloadFiles = async (): Promise<unknown> =>
				Promise.all(vault.getFiles().map(async file => this.cache(file)))
		context.registerEvent(vault.on("create", async file => {
			if (!(file instanceof TFile)) { return }
			await this.cache(file)
		}))
		context.registerEvent(vault.on("rename", async (file, oldPath) => {
			this.uncache(oldPath)
			if (!(file instanceof TFile)) { return }
			await this.cache(file)
		}))
		context.registerEvent(vault.on("modify", async file => {
			if (!(file instanceof TFile)) { return }
			await this.cache(file)
		}))
		context.registerEvent(vault.on("delete", file => {
			this.uncache(file.path)
		}))
		for (const trans of transpiles) {
			trans.onInvalidate.listen(() => {
				const transed = transpiled.get(trans)
				if (!transed) { return }
				for (const [path, id] of Object.entries(cache0)) {
					if (transed.has(id)) { this.recache(path) }
				}
			})
		}
		context.register(preloadRules.onChanged.listen(preloadFiles))
		preloadFiles().catch(error => { self.console.error(error) })
	}

	public override resolve(id: string, context: Context): Resolved | null {
		const { cache0 } = this,
			id0 = this.resolvePath(id, context)
		if (id0 === null) { return null }
		let identity = cache0[id0]
		if (identity) {
			identity = this.checkDependencies(identity, context)
			const { content } = identity
			if (content !== void 0) {
				return {
					code: this.transpile(content, identity),
					cwd: getWD(id0),
					id: id0,
					identity,
				}
			}
		}
		return null
	}

	public override async aresolve(
		id: string,
		context: Context,
	): Promise<Resolved | null> {
		const { cache0, context: { app: { vault, vault: { adapter } } } } = this,
			id0 = await this.aresolvePath(id, context)
		if (id0 === null) { return null }
		let identity = cache0[id0]
		try {
			if (identity) {
				identity = this.checkDependencies(identity, context)
				const { file, content } = identity
				return {
					code: await this.atranspile(
						content ?? await vault.cachedRead(file),
						identity,
					),
					cwd: getWD(id0),
					id: id0,
					identity,
				}
			}
			return {
				code: await this.atranspile(await adapter.read(id0)),
				cwd: getWD(id0),
				id: id0,
				identity: {},
			}
		} catch (error) {
			self.console.debug(error)
			return null
		}
	}

	protected async cache(file: TFile): Promise<CacheIdentity> {
		const { cache0, context: { app: { vault } }, preloadRules } = this,
			{ path } = file
		this.uncache(path)
		const ret = {
			file,
			...preloadRules.test(path)
				? { content: await vault.cachedRead(file) }
				: {},
		}
		AbstractFileResolve.globalCache.add(cache0[path] = ret)
		return ret
	}

	protected recache(path: string): CacheIdentity | null {
		const { cache0 } = this,
			entry = this.uncache(path)
		if (!entry) { return null }
		const ret = { ...entry }
		AbstractFileResolve.globalCache.add(cache0[path] = ret)
		return ret
	}

	protected uncache(path: string): CacheIdentity | null {
		const { cache0 } = this,
			{ [path]: entry } = cache0
		if (!entry) { return null }
		AbstractFileResolve.globalCache.delete(entry)
		Reflect.deleteProperty(cache0, path)
		return entry
	}

	protected checkDependencies(
		identity: CacheIdentity,
		context: Context,
	): CacheIdentity {
		if (![...context.dependencies.get(identity) ?? []]
			.every(dep => AbstractFileResolve.globalCache.has(dep))) {
			return this.recache(identity.file.path) ?? identity
		}
		return identity
	}

	protected transpile(content: string, identity?: CacheIdentity): string {
		const { transpiled, transpiles } = this
		for (const trans of transpiles) {
			const ret = trans.transpile(content, identity)
			if (ret !== null) {
				if (identity) {
					let transed = transpiled.get(trans)
					if (!transed) {
						transed = new WeakSet()
						transpiled.set(trans, transed)
					}
					transed.add(identity)
				}
				return ret
			}
		}
		return content
	}

	protected async atranspile(
		content: string,
		identity?: CacheIdentity,
	): Promise<string> {
		const { atranspiled, transpiles } = this
		for (const trans of transpiles) {
			// eslint-disable-next-line no-await-in-loop
			const ret = await trans.atranspile(content, identity)
			if (ret !== null) {
				if (identity) {
					let transed = atranspiled.get(trans)
					if (!transed) {
						transed = new WeakSet()
						atranspiled.set(trans, transed)
					}
					transed.add(identity)
				}
				return ret
			}
		}
		return content
	}

	protected abstract aresolvePath(
		// eslint-disable-next-line @typescript-eslint/no-invalid-this
		...args: Parameters<typeof this.resolvePath>
		// eslint-disable-next-line @typescript-eslint/no-invalid-this
	): AsyncOrSync<ReturnType<typeof this.resolvePath>>
	protected abstract resolvePath(id: string, context: Context): string | null
}

export class CompositeResolve implements Resolve {
	protected readonly delegates

	public constructor(
		delegates: readonly Resolve[],
	) {
		this.delegates = Object.freeze([...delegates])
	}

	public resolve(
		...args: Parameters<Resolve["resolve"]>
	): ReturnType<Resolve["resolve"]> {
		for (const de of this.delegates) {
			const ret = de.resolve(...args)
			if (ret) { return ret }
		}
		return null
	}

	public async aresolve(
		...args: Parameters<Resolve["aresolve"]>
	): Promise<Awaited<ReturnType<Resolve["aresolve"]>>> {
		for (const de of this.delegates) {
			// eslint-disable-next-line no-await-in-loop
			const ret = await de.aresolve(...args)
			if (ret) { return ret }
		}
		return null
	}
}

export class InternalModulesResolve
	extends AbstractResolve
	implements Resolve {
	protected readonly identities: Record<string, object | undefined> = {}

	public override resolve(id: string, _1: Context): Resolved | null {
		const { context: { settings } } = this
		if (!settings.value.exposeInternalModules) { return null }
		let value = null
		try {
			value = dynamicRequireSync({}, id)
		} catch (error) {
			self.console.debug(error)
			return null
		}
		return this.resolve0(id, value)
	}

	public override async aresolve(
		id: string,
		_1: Context,
	): Promise<Resolved | null> {
		const { context: { settings } } = this
		if (!settings.value.exposeInternalModules) { return null }
		let value = null
		try {
			value = await dynamicRequire({}, id)
		} catch (error) {
			self.console.debug(error)
			return null
		}
		return this.resolve0(id, value)
	}

	protected resolve0(id: string, value: unknown): Resolved {
		return {
			code: "",
			id,
			// eslint-disable-next-line @typescript-eslint/no-extra-parens
			identity: (this.identities[id] ??= {}),
			value,
		}
	}
}

export class VaultPathResolve
	extends AbstractFileResolve
	implements Resolve {
	protected override resolvePath(id: string, _1: Context): string | null {
		return parsePath(id)
	}

	protected override aresolvePath(
		...args: Parameters<typeof this.resolvePath>
	): AsyncOrSync<ReturnType<typeof this.resolvePath>> {
		return this.resolvePath(...args)
	}
}

export class RelativePathResolve
	extends AbstractFileResolve
	implements Resolve {
	protected override resolvePath(id: string, context: Context): string | null {
		return parsePath(`${context.cwds.at(-1) ?? ""}/${id}`)
	}

	protected override aresolvePath(
		...args: Parameters<typeof this.resolvePath>
	): AsyncOrSync<ReturnType<typeof this.resolvePath>> {
		return this.resolvePath(...args)
	}
}

export class MarkdownLinkResolve
	extends AbstractFileResolve
	implements Resolve {
	protected override resolvePath(id: string, context: Context): string | null {
		const { context: { app: { metadataCache } } } = this,
			link = parseMarkdownLink(id)
		if (!link) { return null }
		return metadataCache.getFirstLinkpathDest(
			getLinkpath(link.path),
			context.cwds.at(-1) ?? "",
		)?.path ?? null
	}

	protected override aresolvePath(
		...args: Parameters<typeof this.resolvePath>
	): AsyncOrSync<ReturnType<typeof this.resolvePath>> {
		const { context: { app: { workspace } } } = this
		return new Promise((resolve, reject) => {
			workspace.onLayoutReady(() => {
				try {
					resolve(this.resolvePath(...args))
				} catch (error) {
					reject(error)
				}
			})
		})
	}
}

export class WikilinkResolve
	extends AbstractFileResolve
	implements Resolve {
	protected override resolvePath(id: string, context: Context): string | null {
		const { context: { app: { metadataCache } } } = this,
			link = parseWikilink(id)
		if (!link) { return null }
		return metadataCache.getFirstLinkpathDest(
			getLinkpath(link.path),
			context.cwds.at(-1) ?? "",
		)?.path ?? null
	}

	protected override aresolvePath(
		...args: Parameters<typeof this.resolvePath>
	): AsyncOrSync<ReturnType<typeof this.resolvePath>> {
		const { context: { app: { workspace } } } = this
		return new Promise((resolve, reject) => {
			workspace.onLayoutReady(() => {
				try {
					resolve(this.resolvePath(...args))
				} catch (error) {
					reject(error)
				}
			})
		})
	}
}

function parsePath(path: string): string {
	const pathnames = normalizePath(path).split("/")
	return pathnames.reduce<string[]>((accu, pathname) => {
		switch (pathname) {
			case ".":
				break
			case "..":
				accu.pop()
				break
			default:
				accu.push(pathname)
				break
		}
		return accu
	}, []).join("/")
}

export function getWD(path: string): string {
	return path.split("/")
		.slice(0, -1)
		.join("/")
}

function parseMarkdownLink(link: string): {
	readonly display: string
	readonly path: string
	readonly read: number
	readonly title: string
} | null {
	function parseComponent(
		str: string,
		escaper: CodePoint,
		delimiters: readonly [CodePoint, CodePoint],
	): readonly [ret: string, read: number] {
		const [start, end] = delimiters
		let ret = "",
			read = 0,
			level = 0,
			escaping = false
		for (const cp of str) {
			read += cp.length
			if (escaping) {
				ret += cp
				escaping = false
				continue
			}
			switch (cp) {
				case escaper:
					escaping = true
					break
				case start:
					if (level > 0) { ret += cp }
					++level
					break
				case end:
					--level
					if (level > 0) { ret += cp }
					break
				default:
					ret += cp
					break
			}
			if (level <= 0) { break }
		}
		if (level > 0 ||
			read <= String.fromCodePoint((str || "\x00").charCodeAt(0)).length) {
			return ["", -1]
		}
		return [ret, read]
	}
	const link2 = link.startsWith("!") ? link.slice("!".length) : link,
		[display, read] = parseComponent(
			link2,
			codePoint("\\"),
			[codePoint("["), codePoint("]")],
		)
	if (read < 0) { return null }
	const rest = link2.slice(read),
		[pathtext, read2] = parseComponent(
			rest,
			codePoint("\\"),
			[codePoint("("), codePoint(")")],
		)
	if (read2 !== rest.length) { return null }
	// eslint-disable-next-line @typescript-eslint/no-magic-numbers
	const pathParts = pathtext.split(/ +/u, 2),
		[, title] =
			(/^"(?<title>(?:\\"|[^"])*)"$/u).exec(pathParts[1] ?? "\"\"") ?? []
	if (title === void 0) { return null }
	return {
		display,
		path: self.decodeURI(pathParts[0] ?? ""),
		read: (link.startsWith("!") ? "!".length : 0) + read + read2,
		title,
	}
}

function parseWikilink(
	link: string,
): { readonly display: string; readonly path: string } | null {
	const match = (/^!?\[\[(?<path>[^|]+)\|?(?<display>.*?)\]\]/u).exec(link)
	if (!match) { return null }
	const [str, path, display] = match
	if (str !== link || path === void 0 || display === void 0) { return null }
	return { display: display || (str.includes("|") ? "" : path), path }
}

export class ExternalResolve
	extends AbstractResolve
	implements Resolve {
	public static readonly filter = /^https?:/u
	protected readonly redirects: Record<string, string> = {}
	protected readonly identities: Record<string, {
		readonly code: string
	} | null | undefined> = {}

	public constructor(
		context: ModulesPlugin,
		protected readonly tsTranspile: TypeScriptTranspile,
	) {
		super(context)
	}

	public override resolve(id: string, context: Context): Resolved | null {
		const href = this.normalizeURL(id, context.cwds.at(-1))
		if (href === null) { return null }
		const { identities: { [href]: identity } } = this
		return (identity && {
			code: identity.code,
			cwd: href,
			id: href,
			identity,
		}) ?? null
	}

	public override async aresolve(
		id: string,
		context: Context,
	): Promise<Resolved | null> {
		const [href, identity] = await this.aresolve0(id, context.cwds.at(-1))
		if (href === null) { return null }
		return identity && { code: identity.code, cwd: href, id: href, identity }
	}

	protected async aresolve0(
		id: string,
		cwd?: string,
	): Promise<readonly [string | null, ExternalResolve.Identity | null]> {
		const href = await this.anormalizeURL(id, cwd)
		if (href === null) { return [null, null] }
		const { tsTranspile } = this
		let { identities: { [href]: identity } } = this
		if (identity === void 0) {
			// eslint-disable-next-line no-multi-assign
			this.identities[href] = identity = null
			try {
				const identity2: WeakCacheIdentity & Writable<ExternalResolve.Identity
				> = { code: (await requestUrl(href)).text }
				identity = identity2
				try {
					const { ts } = tsMorphBootstrap,
						code = await tsTranspile.atranspile(identity2.code, identity2, {
							compilerOptions: {
								module: ts.ModuleKind.CommonJS,
							},
							language: "TypeScript",
						})
					if (code !== null) { identity2.code = code }
				} catch (error) {
					self.console.debug(error)
				}
				const reqs: string[] = [],
					opts: Options = {
						allowAwaitOutsideFunction: true,
						allowHashBang: true,
						allowImportExportEverywhere: false,
						allowReserved: true,
						allowReturnOutsideFunction: false,
						allowSuperOutsideMethod: false,
						ecmaVersion: "latest",
						locations: false,
						preserveParens: false,
						ranges: false,
						sourceType: "module",
					},
					tree = parse(identity2.code, opts)
				simple(tree, {
					// eslint-disable-next-line @typescript-eslint/naming-convention
					CallExpression: node => {
						const node2 = node as CallExpression & typeof node,
							{ callee } = node2
						if (callee.type !== "Identifier" || callee.name !== "require") {
							return
						}
						const [arg0] = node2.arguments
						if (arg0?.type !== "Literal" || typeof arg0.value !== "string") {
							return
						}
						const { value } = arg0
						if (importable({}, value)) { return }
						let prefix = ""
						if (!(/^\.{0,2}\//u).test(value)) {
							try {
								// eslint-disable-next-line no-new
								new URL(value)
							} catch (error) {
								self.console.debug(error)
								prefix = "/"
							}
						}
						const value2 = this.normalizeURL(`${prefix}${value}`, href)
						if (value2 === null) { return }
						node2.callee = parseExpressionAt("self.require", 0, opts)
						arg0.raw = escapeJavaScriptString(value2)
						reqs.push(arg0.value = value2)
					},
				})
				identity2.code = generate(tree, { comments: true, indent: "" })
				await Promise.all(reqs.map(async req => this.aresolve0(req)))
			} catch (error) {
				self.console.debug(error)
			}
			this.identities[href] = identity
		}
		return [href, identity]
	}

	protected normalizeURL(id: string, cwd?: string): string | null {
		const { filter } = ExternalResolve
		let href = null
		if (cwd !== void 0) {
			try {
				({ href } = new URL(id, cwd))
				if (!filter.test(href)) { href = null }
			} catch (error) {
				self.console.debug(error)
			}
		}
		if (href === null) {
			try {
				({ href } = new URL(id))
				if (!filter.test(href)) { href = null }
			} catch (error) {
				self.console.debug(error)
			}
		}
		return href === null ? null : this.redirects[href] ?? href
	}

	protected async anormalizeURL(
		...args: Parameters<typeof this.normalizeURL>
	): Promise<ReturnType<typeof this.normalizeURL>> {
		const href = this.normalizeURL(...args)
		if (href !== null) {
			try {
				// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, no-return-assign
				return this.redirects[href] ??= (await fetch(href, {
					mode: "cors",
					redirect: "follow",
					referrerPolicy: "no-referrer",
				})).url
			} catch (error) {
				self.console.debug(error)
			}
		}
		return href
	}
}
export namespace ExternalResolve {
	export interface Identity {
		readonly code: string
	}
}
