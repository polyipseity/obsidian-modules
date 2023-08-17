import type { AsyncOrSync, Writable } from "ts-essentials"
import {
	type CodePoint,
	Rules,
	SettingRules,
	anyToError,
	codePoint,
	dynamicRequire,
	dynamicRequireLazy,
	dynamicRequireSync,
} from "@polyipseity/obsidian-plugin-library"
import type { Context, Require, Resolve, Resolved } from "obsidian-modules"
import { TFile, getLinkpath, normalizePath, requestUrl } from "obsidian"
import type {
	Transpile,
	TypeScriptTranspile,
	WeakCacheIdentity,
} from "./transpile.js"
import type { attachSourceMap, parseAndRewriteRequire } from "../worker.js"
import { BUNDLE } from "../import.js"
import type { ModulesPlugin } from "../main.js"
import { PRECOMPILE_SYNC_PREFIX } from "../magic.js"
import { isObject } from "lodash-es"
import { normalizeURL } from "../util.js"

const
	tsMorphBootstrap = dynamicRequireLazy<typeof import("@ts-morph/bootstrap")
	>(BUNDLE, "@ts-morph/bootstrap")

export interface CacheIdentity {
	readonly file: TFile
	readonly content?: string
}

abstract class AbstractResolve implements Resolve {
	readonly #invalidators: Record<string, Set<Require["invalidate"]
	>> = {}

	public constructor(
		protected readonly context: ModulesPlugin,
	) { }

	protected validate(...args: Parameters<typeof this.resolve>): void {
		const [id, context] = args;
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
		(this.#invalidators[id] ??= new Set()).add(context.require.invalidate)
	}

	protected invalidate(id: string): void {
		const invs = this.#invalidators[id]
		for (const inv of invs ?? []) {
			inv(id)
		}
		invs?.clear()
	}

	protected invalidateAll(): void {
		for (const key of Object.keys(this.#invalidators)) {
			this.invalidate(key)
		}
	}

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
			preload = async (): Promise<unknown> =>
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
		context.register(preloadRules.onChanged.listen(preload))
		preload().catch(error => { self.console.error(error) })
	}

	public override resolve(id: string, context: Context): Resolved | null {
		this.validate(id, context)
		const { cache0 } = this,
			id0 = this.resolvePath(id, context)
		if (id0 === null) { return null }
		const identity = cache0[id0]
		if (identity) {
			const { content } = identity
			if (content !== void 0) {
				this.validate(id0, context)
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
		this.validate(id, context)
		const { cache0, context: { app: { vault, vault: { adapter } } } } = this,
			id0 = await this.aresolvePath(id, context)
		if (id0 === null) { return null }
		const identity = cache0[id0]
		try {
			if (identity) {
				const { file, content } = identity
				this.validate(id0, context)
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
		cache0[path] = ret
		this.invalidate(path)
		return ret
	}

	protected recache(path: string): CacheIdentity | null {
		const { cache0 } = this,
			entry = this.uncache(path)
		if (!entry) { return null }
		const ret = { ...entry }
		cache0[path] = ret
		this.invalidate(path)
		return ret
	}

	protected uncache(path: string): CacheIdentity | null {
		const { cache0 } = this,
			{ [path]: entry } = cache0
		if (!entry) { return null }
		Reflect.deleteProperty(cache0, path)
		this.invalidate(path)
		return entry
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

	public constructor(context: ModulesPlugin) {
		super(context)
		const { context: { settings } } = this
		context.register(settings.onMutate(
			set => set.exposeInternalModules,
			() => { this.invalidateAll() },
		))
	}

	public override resolve(id: string, context: Context): Resolved | null {
		this.validate(id, context)
		const { context: { settings } } = this
		if (!settings.value.exposeInternalModules) { return null }
		let value = null
		try {
			value = dynamicRequireSync({}, id)
		} catch (error) {
			self.console.debug(error)
			return null
		}
		return { code: "", id, value }
	}

	public override async aresolve(
		id: string,
		context: Context,
	): Promise<Resolved | null> {
		this.validate(id, context)
		const { context: { settings } } = this
		if (!settings.value.exposeInternalModules) { return null }
		let value = null
		try {
			value = await dynamicRequire({}, id)
		} catch (error) {
			self.console.debug(error)
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

export class ExternalLinkResolve
	extends AbstractResolve
	implements Resolve {
	protected readonly redirects: Record<string, string> = {}
	protected readonly identities: Record<string, AsyncOrSync<ExternalLinkResolve
		.Identity> | Error | "await"> = {}

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
				if (value instanceof Error) { this.identities[key] = "await" }
			}
		}, { passive: true })
		context.register(settings.onMutate(
			set => set.enableExternalLinks,
			async (_0, _1, set) => {
				this.invalidateAll()
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

	public override resolve(id: string, context: Context): Resolved | null {
		const cwd = context.cwds.at(-1),
			href = this.normalizeURL(id, cwd)
		if (href === null) { return null }
		this.validate(href, context)
		if (!this.context.settings.value.enableExternalLinks) { return null }

		// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, no-multi-assign
		const identity = this.identities[href] ??= "await"
		if (identity instanceof Error) { throw identity }
		return isObject(identity) && ExternalLinkResolve.Identity in identity
			? { ...identity, cwd: href, id: href }
			: null
	}

	public override async aresolve(
		id: string,
		context: Context,
	): Promise<Resolved | null> {
		const cwd = context.cwds.at(-1),
			href0 = this.normalizeURL(id, cwd)
		if (href0 === null) { return null }
		this.validate(href0, context)
		if (!this.context.settings.value.enableExternalLinks) { return null }

		const [href, identity] = await this.aresolve0(id, cwd)
		if (href === null) { return null }
		this.validate(href, context)
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
		let { identities: { [href]: identity } } = this
		if (identity === void 0 || identity === "await") {
			if (identity === "await") { this.invalidate(href) }
			// eslint-disable-next-line no-multi-assign
			this.identities[href] = identity = (async (): Promise<ExternalLinkResolve
				.Identity> => {
				const ret: WeakCacheIdentity & Writable<ExternalLinkResolve
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
						const { ts } = tsMorphBootstrap,
							code = await tsTranspile.atranspile(ret.code, ret, {
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
						self.console.debug(error)
					}
					const { code, requires } =
						await (await this.workerPool).exec<typeof parseAndRewriteRequire>(
							"parseAndRewriteRequire",
							[{ code: ret.code, href }],
						)
					// eslint-disable-next-line require-atomic-updates
					ret.code = code
					await Promise.all(requires.map(async req => this.aresolve0(req)))
				} catch (error) { self.console.debug(error) }
				try { await compile() } catch (error) { self.console.debug(error) }
				return ret
			})()
			try {
				// eslint-disable-next-line no-multi-assign
				this.identities[href] = identity = await identity
			} catch (error) {
				// eslint-disable-next-line no-multi-assign
				this.identities[href] = identity = anyToError(error)
			}
		}
		if (identity instanceof Error) { throw identity }
		return [href, await identity]
	}

	protected normalizeURL(
		...args: Parameters<typeof normalizeURL>
	): ReturnType<typeof normalizeURL> {
		const href = normalizeURL(...args)
		return href === null ? null : this.redirects[href] ?? href
	}

	protected async anormalizeURL(
		...args: Parameters<typeof this.normalizeURL>
	): Promise<ReturnType<typeof this.normalizeURL>> {
		const href = this.normalizeURL(...args)
		if (href !== null) {
			try {
				// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, no-return-assign
				return this.redirects[href] ??= (
					this.invalidate(href),
					(await this.fetchPool.addSingleTask({
						data: href,
						async generator(data) {
							return fetch(data, {
								mode: "cors",
								redirect: "follow",
								referrerPolicy: "no-referrer",
							})
						},
					}).promise()).url
				)
			} catch (error) {
				self.console.debug(error)
			}
		}
		return href
	}
}
export namespace ExternalLinkResolve {
	// eslint-disable-next-line @typescript-eslint/naming-convention
	export const Identity = Symbol("Identity")
	export interface Identity {
		readonly [Identity]: true
		readonly code: string
		readonly compiledSyncCode?: string | undefined
	}
}
