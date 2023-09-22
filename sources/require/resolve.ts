import type { AsyncOrSync, Writable } from "ts-essentials"
import {
	type CodePoint,
	EventEmitterLite,
	Rules,
	SettingRules,
	anyToError,
	clearProperties,
	codePoint,
	dynamicRequire,
	dynamicRequireSync,
	isNonNil,
} from "@polyipseity/obsidian-plugin-library"
import type { Context, Resolve, Resolved } from "obsidian-modules"
import { TFile, getLinkpath, normalizePath, requestUrl } from "obsidian"
import type { Transpile, TypeScriptTranspile } from "./transpile.js"
import type { attachSourceMap, parseAndRewriteRequire } from "../worker.js"
import { BUNDLE } from "../import.js"
import type { ModulesPlugin } from "../main.js"
import { PRECOMPILE_SYNC_PREFIX } from "../magic.js"
import { isObject } from "lodash-es"
import { normalizeURL } from "../util.js"

const
	tsMorphBootstrap = dynamicRequire<typeof import("@ts-morph/bootstrap")
	>(BUNDLE, "@ts-morph/bootstrap")

abstract class AbstractResolve implements Resolve {
	public readonly onInvalidate = new EventEmitterLite<readonly [id: string]>()
	protected readonly ids = new Set<string>()

	public constructor(
		protected readonly context: ModulesPlugin,
	) { }

	public async invalidate(id: string): Promise<void> {
		return this.invalidate0(id, false)
	}

	public async invalidateAll(): Promise<void> {
		return this.invalidateAll0(false)
	}

	protected validate0(...args: Parameters<typeof this.resolve>): void {
		const [id] = args
		this.ids.add(id)
	}

	protected async invalidate0(id: string, emit = true): Promise<void> {
		if (!this.ids.delete(id)) { return }
		if (emit) { await this.onInvalidate.emit(id) }
	}

	protected async invalidateAll0(emit = true): Promise<void> {
		await Promise.all([...this.ids]
			.map(async id => this.invalidate0(id, emit)))
	}

	public abstract aresolve(
		// eslint-disable-next-line @typescript-eslint/no-invalid-this
		...args: Parameters<typeof this.resolve>
		// eslint-disable-next-line @typescript-eslint/no-invalid-this
	): AsyncOrSync<ReturnType<typeof this.resolve>>
	public abstract resolve(id: string, context: Context): Resolved | null
}

export abstract class AbstractFileResolve
	extends AbstractResolve
	implements Resolve {
	protected readonly transpiles
	protected readonly transpiled =
		new WeakMap<Transpile, WeakSet<AbstractFileResolve.Cache.Identity>>()

	public constructor(
		context: ModulesPlugin,
		transpiles: readonly Transpile[],
		protected readonly cache = new AbstractFileResolve.Cache(context),
	) {
		super(context)
		this.transpiles = Object.freeze([...transpiles])
		const { transpiled } = this
		cache.onInvalidate.listen(async path => this.invalidate0(path))
		for (const trans of transpiles) {
			trans.onInvalidate.listen(async () => {
				const transed = transpiled.get(trans)
				if (!transed) { return }
				await Promise.all([...cache]
					.filter(([, id]) => transed.has(id))
					.map(async ([path]) => this.invalidate0(path)))
			})
		}
	}

	public override async invalidate(id: string): Promise<void> {
		const { cache, transpiled } = this,
			id2 = cache.get(id)
		await super.invalidate(id)
		if (!id2) { return }
		await Promise.all(this.transpiles
			.map(async tr => {
				transpiled.get(tr)?.delete(id2)
				return tr.invalidate(id2)
			}))
	}

	public override async invalidateAll(): Promise<void> {
		const { cache, ids, transpiled } = this,
			ids2 = [...ids].map(id => cache.get(id)).filter(isNonNil)
		await super.invalidateAll()
		await Promise.all(this.transpiles.map(async tr => {
			transpiled.delete(tr)
			return Promise.all(ids2.map(async id => tr.invalidate(id)))
		}))
	}

	public override resolve(id: string, context: Context): Resolved | null {
		this.validate0(id, context)
		const { cache } = this,
			id0 = this.resolvePath(id, context)
		if (id0 === null) { return null }
		const identity = cache.get(id0)
		if (identity) {
			const { content } = identity
			if (content !== void 0) {
				this.validate0(id0, context)
				return {
					code: this.transpile(content, identity),
					cwd: getWD(id0),
					id: id0,
				}
			}
		}
		return null
	}

	public override async aresolve(
		id: string,
		context: Context,
	): Promise<Resolved | null> {
		this.validate0(id, context)
		const { cache, context: { app: { vault, vault: { adapter } } } } = this,
			id0 = await this.aresolvePath(id, context)
		if (id0 === null) { return null }
		const identity = cache.get(id0)
		try {
			if (identity) {
				const { file, content } = identity
				this.validate0(id0, context)
				return {
					code: await this.atranspile(
						content ?? await vault.cachedRead(file),
						identity,
					),
					cwd: getWD(id0),
					id: id0,
				}
			}
			return {
				cache: false,
				code: await this.atranspile(await adapter.read(id0)),
				cwd: getWD(id0),
				id: id0,
			}
		} catch (error) {
			/* @__PURE__ */ self.console.debug(error)
			return null
		}
	}

	protected transpile(
		content: string,
		id?: AbstractFileResolve.Cache.Identity,
	): string {
		const { transpiled, transpiles } = this
		for (const trans of transpiles) {
			const ret = trans.transpile(id ?? {}, content, id?.file)
			if (ret !== null) {
				if (id) {
					let transed = transpiled.get(trans)
					if (!transed) {
						transed = new WeakSet()
						transpiled.set(trans, transed)
					}
					transed.add(id)
				}
				return ret
			}
		}
		return content
	}

	protected async atranspile(
		content: string,
		id?: AbstractFileResolve.Cache.Identity,
	): Promise<string> {
		const { transpiled, transpiles } = this
		for (const trans of transpiles) {
			// eslint-disable-next-line no-await-in-loop
			const ret = await trans.atranspile(id ?? {}, content, id?.file)
			if (ret !== null) {
				if (id) {
					let transed = transpiled.get(trans)
					if (!transed) {
						transed = new WeakSet()
						transpiled.set(trans, transed)
					}
					transed.add(id)
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
export namespace AbstractFileResolve {
	export class Cache {
		public readonly onInvalidate = new EventEmitterLite<readonly [
			path: string,
			cache: Cache.Identity | null,
		]>()

		protected readonly data = new Map<string, Cache.Identity>()
		protected readonly preloadRules = new SettingRules(
			this.context,
			set => set.preloadingRules,
			Rules.pathInterpreter,
		)

		public constructor(
			protected readonly context: ModulesPlugin,
		) {
			const { context: { app: { vault } }, preloadRules } = this,
				preload = async (): Promise<unknown> =>
					Promise.all(vault.getFiles().map(async file => this.cache(file)))
			context.registerEvent(vault.on("create", async file => {
				if (!(file instanceof TFile)) { return }
				await this.cache(file)
			}))
			context.registerEvent(vault.on("rename", async (file, oldPath) => {
				await this.uncache(oldPath)
				if (!(file instanceof TFile)) { return }
				await this.cache(file)
			}))
			context.registerEvent(vault.on("modify", async file => {
				if (!(file instanceof TFile)) { return }
				await this.cache(file)
			}))
			context.registerEvent(vault.on("delete", async file => {
				await this.uncache(file.path)
			}))
			context.register(preloadRules.onChanged.listen(preload))
			preload().catch(error => { self.console.error(error) })
		}

		public get(path: string): Cache.Identity | undefined {
			return this.data.get(path)
		}

		public [Symbol.iterator](): IterableIterator<readonly [string, Cache
			.Identity]> {
			return Object.entries(this.data)[Symbol.iterator]()
		}

		protected async cache(file: TFile): Promise<Cache.Identity> {
			const { data, context: { app: { vault } }, preloadRules } = this,
				{ path } = file,
				ret = {
					file,
					...preloadRules.test(path)
						? { content: await vault.cachedRead(file) }
						: {},
				}
			data.set(path, ret)
			await this.onInvalidate.emit(path, ret)
			return ret
		}

		protected async uncache(path: string): Promise<Cache.Identity | null> {
			const { data } = this,
				ret = data.get(path)
			if (!ret) { return null }
			data.delete(path)
			await this.onInvalidate.emit(path, null)
			return ret
		}
	}
	export namespace Cache {
		export interface Identity {
			readonly file: TFile
			readonly content?: string
		}
	}
}

export class CompositeResolve implements Resolve {
	public readonly onInvalidate = new EventEmitterLite<readonly [id: string]>()
	protected readonly delegates

	public constructor(
		delegates: readonly Resolve[],
	) {
		this.delegates = Object.freeze([...delegates])
		for (const delegate of this.delegates) {
			delegate.onInvalidate.listen(async id => this.onInvalidate.emit(id))
		}
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

	public async invalidate(
		...args: Parameters<Resolve["invalidate"]>
	): Promise<Awaited<ReturnType<Resolve["invalidate"]>>> {
		await Promise.all(this.delegates
			.map(async de => de.invalidate(...args)))
	}

	public async invalidateAll(
		...args: Parameters<Resolve["invalidateAll"]>
	): Promise<Awaited<ReturnType<Resolve["invalidateAll"]>>> {
		await Promise.all(this.delegates
			.map(async de => de.invalidateAll(...args)))
	}
}

export class InternalModulesResolve
	extends AbstractResolve
	implements Resolve {
	protected readonly identities = new Map<string, object | undefined>()

	public constructor(context: ModulesPlugin) {
		super(context)
		const { context: { settings } } = this
		context.register(settings.onMutate(
			set => set.exposeInternalModules,
			async () => this.invalidateAll0(),
		))
	}

	public override resolve(id: string, context: Context): Resolved | null {
		this.validate0(id, context)
		const { context: { settings } } = this
		if (!settings.value.exposeInternalModules) { return null }
		let value = null
		try {
			value = dynamicRequireSync(new Map(), id)
		} catch (error) {
			/* @__PURE__ */ self.console.debug(error)
			return null
		}
		return { code: "", id, value }
	}

	public override async aresolve(
		id: string,
		context: Context,
	): Promise<Resolved | null> {
		this.validate0(id, context)
		const { context: { settings } } = this
		if (!settings.value.exposeInternalModules) { return null }
		let value = null
		try {
			value = await dynamicRequire(new Map(), id)
		} catch (error) {
			/* @__PURE__ */ self.console.debug(error)
			return null
		}
		return { code: "", id, value }
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

function getWD(path: string): string {
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

export class ExternalLinkResolve
	extends AbstractResolve
	implements Resolve {
	protected readonly redirects = new Map<string, string>()
	protected readonly identities =
		new Map<string, AsyncOrSync<ExternalLinkResolve
			.Identity> | Error | "await">()

	public constructor(
		context: ModulesPlugin,
		protected readonly tsTranspile: TypeScriptTranspile,
		protected readonly sourceRoot = "",
		protected readonly fetchPool = context.fetchPool,
		protected readonly workerPool = context.workerPool,
	) {
		super(context)
		const { context: { settings } } = this,
			preload = async (hrefs: readonly string[]): Promise<void> => {
				if (!settings.value.enableExternalLinks) { return }
				await Promise.all(hrefs.map(async href => this.aresolve0(href)))
			}
		context.registerDomEvent(self, "online", () => {
			for (const [key, value] of Object.entries(this.identities)) {
				if (value instanceof Error) { this.identities.set(key, "await") }
			}
		}, { passive: true })
		context.register(settings.onMutate(
			set => set.enableExternalLinks,
			async (_0, _1, set) => {
				await this.invalidateAll0()
				await preload(set.preloadedExternalLinks)
			},
		))
		context.register(settings.onMutate(
			set => set.preloadedExternalLinks,
			async (cur, prev) => {
				const prev2 = new Set(prev)
				await preload(cur.filter(cur2 => !prev2.has(cur2)))
			},
		))
		preload(settings.value.preloadedExternalLinks)
			.catch(error => { self.console.error(error) })
	}

	public override async invalidate(id: string): Promise<void> {
		const { redirects, identities, tsTranspile } = this,
			idr = redirects.get(id),
			id2 = identities.get(idr ?? id)
		await super.invalidate(id)
		redirects.delete(id)
		identities.delete(idr ?? id)
		const id3 = await Promise.resolve(id2).catch(() => { })
		if (isObject(id3)) { tsTranspile.invalidate(id3) }
	}

	public override async invalidateAll(): Promise<void> {
		const { identities, redirects, tsTranspile } = this,
			ids = [...identities.values()]
		await super.invalidateAll()
		clearProperties(redirects)
		clearProperties(identities)
		await Promise.all(ids.map(async id => {
			const id2 = await Promise.resolve(id).catch(() => { })
			if (isObject(id2)) { tsTranspile.invalidate(id2) }
		}))
	}

	public override resolve(id: string, context: Context): Resolved | null {
		const cwd = context.cwds.at(-1) ?? void 0,
			href = this.normalizeURL(id, cwd)
		if (href === null) { return null }
		this.validate0(href, context)
		if (!this.context.settings.value.enableExternalLinks) { return null }

		const identity = this.identities.get(href) ??
			((): typeof val => {
				const val = "await"
				this.identities.set(href, val)
				return val
			})()
		if (identity instanceof Error) { throw identity }
		return isObject(identity) && ExternalLinkResolve.Identity in identity
			? { ...identity, cwd: href, id: href }
			: null
	}

	public override async aresolve(
		id: string,
		context: Context,
	): Promise<Resolved | null> {
		const cwd = context.cwds.at(-1) ?? void 0,
			href0 = this.normalizeURL(id, cwd)
		if (href0 === null) { return null }
		this.validate0(href0, context)
		if (!this.context.settings.value.enableExternalLinks) { return null }

		const [href, identity] = await this.aresolve0(id, cwd)
		if (href === null) { return null }
		this.validate0(href, context)
		return { ...identity, cwd: href, id: href }
	}

	protected async aresolve0(
		id: string,
		cwd?: string,
	): Promise<readonly [null, null] |
		readonly [string, ExternalLinkResolve.Identity]> {
		const href = await this.anormalizeURL(id, cwd)
		if (href === null) { return [null, null] }
		const { tsTranspile } = this
		let identity = this.identities.get(href)
		if (identity === void 0 || identity === "await") {
			const awaiting = identity === "await"
			this.identities.set(
				href,
				identity = (async (): Promise<ExternalLinkResolve
					.Identity> => {
					const ret: Writable<ExternalLinkResolve
						.Identity> = {
						[ExternalLinkResolve.Identity]: true,
						code: (await this.fetchPool.addSingleTask({
							data: href,
							async generator(data) {
								return requestUrl(data)
							},
						}).promise()).text,
					}
					let compile = (): unknown => null
					try {
						compile = async (): Promise<void> => {
							// eslint-disable-next-line require-atomic-updates
							ret.compiledSyncCode =
								await (await this.workerPool).exec<typeof attachSourceMap>(
									"attachSourceMap",
									[
										{
											code: ret.code,
											id: href,
											prefix: PRECOMPILE_SYNC_PREFIX,
											sourceRoot: this.sourceRoot,
											type: "script",
										},
									],
								)
						}
						try {
							const { ts } = await tsMorphBootstrap,
								code = await tsTranspile.atranspile(ret, ret.code, void 0, {
									compilerOptions: {
										module: ts.ModuleKind.CommonJS,
									},
									language: "TypeScript",
								})
							if (code !== null) {
								// eslint-disable-next-line require-atomic-updates
								ret.code = code
							}
						} catch (error) {
							/* @__PURE__ */ self.console.debug(error)
						}
						const { code, requires } =
							await (await this.workerPool).exec<typeof parseAndRewriteRequire>(
								"parseAndRewriteRequire",
								[{ code: ret.code, href }],
							)
						// eslint-disable-next-line require-atomic-updates
						ret.code = code
						await Promise.all(requires.map(async req => this.aresolve0(req)))
					} catch (error) { /* @__PURE__ */ self.console.debug(error) }
					try { await compile() } catch (error) {
						/* @__PURE__ */ self.console.debug(error)
					}
					return ret
				})(),
			)
			if (awaiting) { await this.invalidate0(href) }
			try {
				this.identities.set(href, identity = await identity)
			} catch (error) {
				this.identities.set(href, identity = anyToError(error))
			}
		}
		if (identity instanceof Error) { throw identity }
		return [href, await identity]
	}

	protected normalizeURL(
		...args: Parameters<typeof normalizeURL>
	): ReturnType<typeof normalizeURL> {
		const href = normalizeURL(...args)
		return href === null ? null : this.redirects.get(href) ?? href
	}

	protected async anormalizeURL(
		...args: Parameters<typeof this.normalizeURL>
	): Promise<ReturnType<typeof this.normalizeURL>> {
		const href = this.normalizeURL(...args)
		if (href !== null) {
			try {
				return this.redirects.get(href) ?? await (async (): Promise<
					typeof val> => {
					const val = (await this.fetchPool.addSingleTask({
						data: href,
						async generator(data) {
							return fetch(data, {
								mode: "cors",
								redirect: "follow",
								referrerPolicy: "no-referrer",
							})
						},
					}).promise()
						.then(async val2 => {
							try {
								await this.invalidate0(href)
							} catch (error) { /* @__PURE__ */ self.console.debug(error) }
							return val2
						})).url
					this.redirects.set(href, val)
					return val
				})()
			} catch (error) {
				/* @__PURE__ */ self.console.debug(error)
			}
		}
		return href
	}
}
export namespace ExternalLinkResolve {
	// eslint-disable-next-line @typescript-eslint/naming-convention
	export const Identity = Symbol("ExternalLinkResolve.Identity")
	export interface Identity {
		readonly [Identity]: true
		readonly code: string
		readonly compiledSyncCode?: string | undefined
	}
}
