import type { Resolve, Resolved } from "obsidian-modules"
import { type TAbstractFile, TFile, normalizePath } from "obsidian"
import type { ModulesPlugin } from "../main.js"
import { dynamicRequireSync } from "@polyipseity/obsidian-plugin-library"

abstract class AbstractResolve implements Resolve {
	public constructor(
		protected readonly context: ModulesPlugin,
	) { }
	public abstract resolve(id: string): Resolved | null
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
			filter = (file: TAbstractFile): file is TFile => {
				if (!(file instanceof TFile)) { return false }
				return file.extension === "js"
			}
		context.registerEvent(vault.on("create", async file => {
			if (!filter(file)) { return }
			cache[file.path] = [await vault.cachedRead(file)]
		}))
		context.registerEvent(vault.on("rename", async (file, oldPath) => {
			Reflect.deleteProperty(cache, oldPath)
			if (!filter(file)) { return }
			// eslint-disable-next-line require-atomic-updates
			cache[file.path] = [await vault.cachedRead(file)]
		}))
		context.registerEvent(vault.on("modify", async file => {
			if (!filter(file)) { return }
			cache[file.path] = [await vault.cachedRead(file)]
		}))
		context.registerEvent(vault.on("delete", file => {
			Reflect.deleteProperty(cache, file.path)
		}))
		Promise.all(vault.getFiles()
			.filter(filter)
			.map(async file => {
				cache[file.path] = [await vault.cachedRead(file)]
			}))
			.catch(error => { self.console.error(error) })
	}

	public resolve(id: string): Resolved | null {
		const id0 = this.resolve0(id)
		if (id0 === null) { return null }
		const identity = this.cache[id0]
		if (!identity) { return null }
		return {
			code: identity[0],
			id: id0,
			identity,
		}
	}

	protected abstract resolve0(id: string): string | null
}
namespace AbstractFileResolve {
	export type CacheIdentity = readonly [code: string]
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
	public override resolve0(id: string): string | null {
		if (!(/^[/\\]/u).exec(id)) { return null }
		return parsePath(id)
	}
}

export class RelativePathResolve
	extends AbstractFileResolve
	implements Resolve {
	public override resolve0(id: string): string | null {
		if (!(/^\.{1,2}[/\\]/u).exec(id)) { return null }
		return parsePath(id)
	}
}

export class MarkdownLinkResolve
	extends AbstractFileResolve
	implements Resolve {
	public override resolve0(id: string): string | null {
		return id
	}
}

export class WikilinkResolve
	extends AbstractFileResolve
	implements Resolve {
	public override resolve0(id: string): string | null {
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
