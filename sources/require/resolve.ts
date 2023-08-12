import {
	type CodePoint,
	codePoint,
	dynamicRequire,
	dynamicRequireSync,
} from "@polyipseity/obsidian-plugin-library"
import type { Context, Resolve, Resolved } from "obsidian-modules"
import { TFile, getLinkpath, normalizePath } from "obsidian"
import type { AsyncOrSync } from "ts-essentials"
import type { ModulesPlugin } from "../main.js"
import type { Transpile } from "./transpile.js"
import { isUndefined } from "lodash-es"

abstract class AbstractResolve implements Resolve {
	public constructor(
		protected readonly context: ModulesPlugin,
	) { }
	public abstract resolve(id: string, context: Context): Resolved | null
	public abstract aresolve(
		id: string,
		context: Context,
	): PromiseLike<Resolved | null>
}

abstract class AbstractFileResolve
	extends AbstractResolve
	implements Resolve {
	public static readonly globalCache = new WeakSet()
	protected readonly transpiles

	protected readonly cache0: Record<string, AbstractFileResolve
		.CacheIdentity> = {}

	protected readonly transpiled =
		new WeakMap<Transpile, WeakSet<AbstractFileResolve.CacheIdentity>>()

	public constructor(
		context: ModulesPlugin,
		transpiles: readonly Transpile[],
	) {
		super(context)
		this.transpiles = Object.freeze([...transpiles])
		const { cache0, context: { app: { vault } }, transpiled } = this
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
		Promise.all(vault.getFiles()
			.map(async file => this.cache(file)))
			.catch(error => { self.console.error(error) })
		for (const trans of transpiles) {
			trans.onInvalidate.listen(() => {
				const transed = transpiled.get(trans)
				if (!transed) { return }
				for (const [path, id] of Object.entries(cache0)) {
					if (transed.has(id)) { this.recache(path) }
				}
			})
		}
	}

	public override resolve(id: string, context: Context): Resolved | null {
		const { cache0 } = this,
			id0 = this.resolvePath(id, context)
		if (id0 === null) { return null }
		let identity = cache0[id0]
		if (identity) {
			identity = this.checkDependencies(identity, context)
			const { content } = identity
			if (!isUndefined(content)) {
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
					code: this.transpile(
						content ?? await vault.cachedRead(file),
						identity,
					),
					cwd: getWD(id0),
					id: id0,
					identity,
				}
			}
			return {
				code: this.transpile(await adapter.read(id0)),
				cwd: getWD(id0),
				id: id0,
				identity: {},
			}
		} catch (error) {
			self.console.debug(error)
			return null
		}
	}

	protected async cache(
		file: TFile,
	): Promise<AbstractFileResolve.CacheIdentity> {
		const { cache0, context: { app: { vault } } } = this,
			{ name, path } = file
		this.uncache(path)
		const ret = {
			file,
			...[/\.js$/iu, /\.mjs$/iu, /\.js\.md$/iu, /\.mjs\.md$/iu]
				.some(regex => regex.test(name))
				? { content: await vault.cachedRead(file) }
				: {},
		}
		AbstractFileResolve.globalCache.add(cache0[path] = ret)
		return ret
	}

	protected recache(
		path: string,
	): AbstractFileResolve.CacheIdentity | null {
		const { cache0 } = this,
			entry = this.uncache(path)
		if (!entry) { return null }
		const ret = { ...entry }
		AbstractFileResolve.globalCache.add(cache0[path] = ret)
		return ret
	}

	protected uncache(path: string): AbstractFileResolve.CacheIdentity | null {
		const { cache0 } = this,
			{ [path]: entry } = cache0
		if (!entry) { return null }
		AbstractFileResolve.globalCache.delete(entry)
		Reflect.deleteProperty(cache0, path)
		return entry
	}

	protected checkDependencies(
		identity: AbstractFileResolve.CacheIdentity,
		context: Context,
	): AbstractFileResolve.CacheIdentity {
		if (![...context.dependencies.get(identity) ?? []]
			.every(dep => AbstractFileResolve.globalCache.has(dep))) {
			return this.recache(identity.file.path) ?? identity
		}
		return identity
	}

	protected transpile(
		content: string,
		identity?: AbstractFileResolve.CacheIdentity,
	): string {
		const { transpiled, transpiles } = this
		for (const trans of transpiles) {
			const ret = trans.transpile(content, identity?.file)
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

	protected aresolvePath(
		...args: Parameters<typeof this.resolvePath>
	): AsyncOrSync<ReturnType<typeof this.resolvePath>> {
		return this.resolvePath(...args)
	}

	protected abstract resolvePath(id: string, context: Context): string | null
}
namespace AbstractFileResolve {
	export interface CacheIdentity {
		readonly file: TFile
		readonly content?: string
	}
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
	public override resolvePath(id: string, _1: Context): string | null {
		return parsePath(id)
	}
}

export class RelativePathResolve
	extends AbstractFileResolve
	implements Resolve {
	public override resolvePath(id: string, context: Context): string | null {
		return parsePath(`${context.cwds.at(-1) ?? ""}/${id}`)
	}
}

export class MarkdownLinkResolve
	extends AbstractFileResolve
	implements Resolve {
	public override resolvePath(id: string, context: Context): string | null {
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
	public override resolvePath(id: string, context: Context): string | null {
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
	if (isUndefined(title)) { return null }
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
	if (str !== link || isUndefined(path) || isUndefined(display)) { return null }
	return { display: display || (str.includes("|") ? "" : path), path }
}
