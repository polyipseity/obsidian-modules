import type { Context, Resolve, Resolved } from "obsidian-modules"
import { TFile, normalizePath } from "obsidian"
import {
	dynamicRequire,
	dynamicRequireSync,
} from "@polyipseity/obsidian-plugin-library"
import type { ModulesPlugin } from "../main.js"

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
	protected readonly cache0: Record<string, AbstractFileResolve
		.CacheIdentity> = {}

	public constructor(
		context: ModulesPlugin,
	) {
		super(context)
		const { context: { app: { vault } } } = this
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
	}

	public override resolve(id: string, context: Context): Resolved | null {
		const { cache0: cache } = this,
			id0 = this.resolvePath(id, context)
		if (id0 === null) { return null }
		const identity = cache[id0]
		if (identity) {
			const [code] = identity
			if (typeof code === "string") {
				return { code, cwd: getWD(id0), id: id0, identity }
			}
		}
		return null
	}

	public override async aresolve(
		id: string,
		context: Context,
	): Promise<Resolved | null> {
		const { cache0, context: { app: { vault, vault: { adapter } } } } = this,
			id0 = this.resolvePath(id, context)
		if (id0 === null) { return null }
		let identity = cache0[id0]
		try {
			if (identity) {
				if (![...context.dependencies.get(identity) ?? []]
					.every(dep => AbstractFileResolve.globalCache.has(dep))) {
					identity = this.recache(id0) ?? identity
				}
				const [accessor] = identity,
					code = typeof accessor === "string"
						? accessor
						: await vault.cachedRead(accessor)
				return { code, cwd: getWD(id0), id: id0, identity }
			}
			return {
				code: await adapter.read(id0),
				cwd: getWD(id0),
				id: id0,
				identity: [],
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
			{ extension, path } = file
		this.uncache(path)
		const ret = Object.freeze([
			extension === "js"
				? await vault.cachedRead(file)
				: file,
		])
		AbstractFileResolve.globalCache.add(cache0[path] = ret)
		return ret
	}

	protected recache(
		path: string,
	): AbstractFileResolve.CacheIdentity | null {
		const { cache0 } = this,
			entry = this.uncache(path)
		if (!entry) { return null }
		const ret = Object.freeze([...entry])
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

	protected abstract resolvePath(id: string, context: Context): string | null
}
namespace AbstractFileResolve {
	export type CacheIdentity = readonly [code: TFile | string]
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
		return parsePath(`${context.cwd.at(-1) ?? ""}/${id}`)
	}
}

export class MarkdownLinkResolve
	extends AbstractFileResolve
	implements Resolve {
	public override resolvePath(id: string, _1: Context): string | null {
		return id
	}
}

export class WikilinkResolve
	extends AbstractFileResolve
	implements Resolve {
	public override resolvePath(id: string, _1: Context): string | null {
		return id
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
