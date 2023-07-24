import type { Resolve, Resolved } from "obsidian-modules"
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
	public abstract resolve(id: string): Resolved | null
	public abstract aresolve(id: string): PromiseLike<Resolved | null>
}

abstract class AbstractFileResolve
	extends AbstractResolve
	implements Resolve {
	protected readonly cache: Record<string, AbstractFileResolve
		.CacheIdentity> = {}

	public constructor(
		context: ModulesPlugin,
	) {
		super(context)
		const { cache, context: { app: { vault } } } = this,
			cache0 = async (
				file: TFile,
			): Promise<AbstractFileResolve.CacheIdentity> =>
				[
					file.extension === "js"
						? await vault.cachedRead(file)
						: file,
				]
		context.registerEvent(vault.on("create", async file => {
			if (!(file instanceof TFile)) { return }
			cache[file.path] = await cache0(file)
		}))
		context.registerEvent(vault.on("rename", async (file, oldPath) => {
			Reflect.deleteProperty(cache, oldPath)
			if (!(file instanceof TFile)) { return }
			// eslint-disable-next-line require-atomic-updates
			cache[file.path] = await cache0(file)
		}))
		context.registerEvent(vault.on("modify", async file => {
			if (!(file instanceof TFile)) { return }
			cache[file.path] = await cache0(file)
		}))
		context.registerEvent(vault.on("delete", file => {
			Reflect.deleteProperty(cache, file.path)
		}))
		Promise.all(vault.getFiles()
			.map(async file => {
				cache[file.path] = await cache0(file)
			}))
			.catch(error => { self.console.error(error) })
	}

	public override resolve(id: string): Resolved | null {
		const { cache } = this,
			id0 = this.resolvePath(id)
		if (id0 === null) { return null }
		const identity = cache[id0]
		if (identity) {
			const [code] = identity
			if (typeof code === "string") {
				return { code, id: id0, identity }
			}
		}
		return null
	}

	public override async aresolve(id: string): Promise<Resolved | null> {
		const { cache, context: { app: { vault, vault: { adapter } } } } = this,
			id0 = this.resolvePath(id)
		if (id0 === null) { return null }
		const identity = cache[id0]
		try {
			if (identity) {
				const [accessor] = identity,
					code = typeof accessor === "string"
						? accessor
						: await vault.cachedRead(accessor)
				return { code, id: id0, identity }
			}
			return { code: await adapter.read(id0), id: id0, identity: [] }
		} catch (error) {
			self.console.debug(error)
			return null
		}
	}

	protected abstract resolvePath(id: string): string | null
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

	public resolve(id: string): Resolved | null {
		for (const de of this.delegates) {
			const ret = de.resolve(id)
			if (ret) { return ret }
		}
		return null
	}

	public async aresolve(id: string): Promise<Resolved | null> {
		for (const de of this.delegates) {
			// eslint-disable-next-line no-await-in-loop
			const ret = await de.aresolve(id)
			if (ret) { return ret }
		}
		return null
	}
}

export class InternalModulesResolve
	extends AbstractResolve
	implements Resolve {
	protected readonly identities: Record<string, object | undefined> = {}

	public override resolve(id: string): Resolved | null {
		let value = null
		try {
			value = dynamicRequireSync({}, id)
		} catch (error) {
			self.console.debug(error)
			return null
		}
		return this.resolve0(id, value)
	}

	public override async aresolve(id: string): Promise<Resolved | null> {
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
	public override resolvePath(id: string): string | null {
		return parsePath(id)
	}
}

export class RelativePathResolve
	extends AbstractFileResolve
	implements Resolve {
	public override resolvePath(id: string): string | null {
		return parsePath(id)
	}
}

export class MarkdownLinkResolve
	extends AbstractFileResolve
	implements Resolve {
	public override resolvePath(id: string): string | null {
		return id
	}
}

export class WikilinkResolve
	extends AbstractFileResolve
	implements Resolve {
	public override resolvePath(id: string): string | null {
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
