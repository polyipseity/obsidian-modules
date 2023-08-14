import {
	EventEmitterLite,
	type Fixed,
	cloneAsWritable,
	deepFreeze,
	fixTyped,
	launderUnchecked,
	markFixed,
	splitLines,
} from "@polyipseity/obsidian-plugin-library"
import { createProjectSync, ts } from "@ts-morph/bootstrap"
import type { AsyncOrSync } from "ts-essentials"
import type { CacheIdentity } from "./resolve.js"
import type { ModulesPlugin } from "../main.js"
import type { TFile } from "obsidian"
import { isUndefined } from "lodash-es"
import { pool } from "workerpool"
import type { run } from "./ts-transpile.worker.js"
import { toObjectURL } from "@aidenlx/esbuild-plugin-inline-worker/utils"
// eslint-disable-next-line import/no-unresolved
import tsTranspileWorker from "worker:./ts-transpile.worker.js"

export interface Transpile {
	readonly onInvalidate: EventEmitterLite<readonly []>
	readonly atranspile: (
		...args: Parameters<Transpile["transpile"]>
	) => AsyncOrSync<ReturnType<Transpile["transpile"]>>
	readonly transpile: (
		content: string,
		identity?: CacheIdentity,
	) => string | null
}

interface ContentHeader {
	readonly language?: string | undefined
	readonly compilerOptions?: object | undefined
}
namespace ContentHeader {
	export const DEFAULT: ContentHeader = deepFreeze({})
	export function fix(self0: unknown): Fixed<ContentHeader> {
		const unc = launderUnchecked<ContentHeader>(self0)
		return markFixed(unc, {
			compilerOptions: fixTyped(
				DEFAULT,
				unc,
				"compilerOptions",
				["object", "undefined"],
			),
			language: fixTyped(
				DEFAULT,
				unc,
				"language",
				["string", "undefined"],
			),
		})
	}
	export function parse(content: string): ContentHeader {
		const [, json] = (/^\/\/(?<json>.*)$/mu).exec(content.trimStart()) ?? []
		let ret: unknown = null
		try {
			ret = JSON.parse(json ?? "{}")
		} catch (error) {
			self.console.debug(error)
		}
		return fix(ret).value
	}
}

abstract class AbstractTranspile implements Transpile {
	public readonly onInvalidate = new EventEmitterLite<readonly []>()

	public constructor(
		protected readonly context: ModulesPlugin,
	) { }

	public abstract atranspile(
		// eslint-disable-next-line @typescript-eslint/no-invalid-this
		...args: Parameters<typeof this.transpile>
		// eslint-disable-next-line @typescript-eslint/no-invalid-this
	): AsyncOrSync<ReturnType<typeof this.transpile>>

	public abstract transpile(
		content: string,
		identity?: CacheIdentity,
	): string | null
}

export class TypeScriptTranspile
	extends AbstractTranspile
	implements Transpile {
	protected readonly workers = pool({})
	protected readonly cache = new WeakMap<CacheIdentity, string>()
	protected readonly acache =
		new WeakMap<CacheIdentity, Promise<string | null>>()

	public constructor(context: ModulesPlugin) {
		super(context)
		const url = toObjectURL(tsTranspileWorker)
		try {
			context.register(() => { URL.revokeObjectURL(url) })
			const workers = pool(url, { workerType: "web" })
			context.register(async () => workers.terminate(true))
			this.workers = workers
		} catch (error) {
			URL.revokeObjectURL(url)
			throw error
		}
	}

	public override transpile(
		content: string,
		identity?: CacheIdentity,
		header?: ContentHeader,
	): string | null {
		const ret = identity && this.cache.get(identity)
		if (!isUndefined(ret)) { return ret }
		const header2 = cloneAsWritable(header ?? ContentHeader.parse(content))
		if (isUndefined(header2.language) &&
			(/.m?ts$/u).test(identity?.file.extension ?? "")) {
			header2.language = "TypeScript"
		}
		if (header2.language !== "TypeScript") { return null }
		const
			project = createProjectSync({
				compilerOptions: {
					inlineSourceMap: true,
					inlineSources: true,
					module: ts.ModuleKind.CommonJS,
					target: ts.ScriptTarget.ESNext,
					...header2.compilerOptions,
				},
				useInMemoryFileSystem: true,
			}),
			source = project.createSourceFile("index.ts", content),
			program = project.createProgram()
		let ret2 = null
		const { diagnostics } = program.emit(source, (filename, string) => {
			if (filename.endsWith("index.js")) { ret2 = string }
		})
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
		if (ret2 === null) {
			throw new Error(
				project.formatDiagnosticsWithColorAndContext(diagnostics),
			)
		}
		if (identity) { this.cache.set(identity, ret2) }
		return ret2
	}

	public override atranspile(
		content: string,
		identity?: CacheIdentity,
		header?: ContentHeader,
	): AsyncOrSync<ReturnType<typeof this.transpile>> {
		let ret = identity && this.acache.get(identity)
		if (!isUndefined(ret)) { return ret }
		ret = (async (): Promise<string | null> => {
			const header2 = cloneAsWritable(header ?? ContentHeader.parse(content))
			if (isUndefined(header2.language) &&
				(/.m?ts$/u).test(identity?.file.extension ?? "")) {
				header2.language = "TypeScript"
			}
			if (header2.language !== "TypeScript") { return null }
			return this.workers.exec<typeof run>("run", [
				{
					compilerOptions: header2.compilerOptions,
					content,
				},
			])
		})()
		if (identity) { this.acache.set(identity, ret) }
		return ret
	}
}

export class MarkdownTranspile
	extends AbstractTranspile
	implements Transpile {
	protected readonly tsTranspile = new TypeScriptTranspile(this.context)

	public constructor(context: ModulesPlugin) {
		super(context)
		const { context: { settings } } = this
		context.register(settings.onMutate(
			set => set.markdownCodeBlockLanguagesToLoad,
			async () => this.onInvalidate.emit(),
		))
	}

	public override transpile(
		content: string,
		identity?: CacheIdentity,
	): string | null {
		if (identity?.file.extension !== "md") { return null }
		const { tsTranspile } = this,
			ret = this.transpileMarkdown(content)
		return tsTranspile.transpile(
			ret,
			identity,
			this.getHeader(identity.file),
		) ?? ret
	}

	public override async atranspile(
		content: string,
		identity?: CacheIdentity,
	): Promise<ReturnType<typeof this.transpile>> {
		if (identity?.file.extension !== "md") { return null }
		const { tsTranspile } = this,
			ret = this.transpileMarkdown(content)
		return await tsTranspile.atranspile(
			ret,
			identity,
			this.getHeader(identity.file),
		) ?? ret
	}

	protected getHeader(file: TFile): ContentHeader {
		const { context: { app: { metadataCache } } } = this,
			ret = ContentHeader
				.fix(metadataCache.getFileCache(file)?.frontmatter?.["module"])
				.value
		if (isUndefined(ret.language) && (/.m?ts$/u).test(file.basename)) {
			ret.language = "TypeScript"
		}
		return ret
	}

	protected transpileMarkdown(content: string): string {
		const { context: { settings } } = this,
			ret = []
		let delimiter = "",
			code = false
		for (const line of splitLines(content)) {
			if (delimiter) {
				if (line.startsWith(delimiter)) {
					ret.push(`// ${line}`)
					delimiter = ""
					code = false
					continue
				}
				ret.push(code ? line : `// ${line}`)
				continue
			}
			ret.push(`// ${line}`)
			const match = (/^(?<delimiter>[`~]{3,})(?<language>.*)$/mu).exec(line)
			if (match) {
				const [, delimiter2, language] = match
				if (isUndefined(delimiter2) || isUndefined(language)) { continue }
				delimiter = delimiter2
				if (settings.value.markdownCodeBlockLanguagesToLoad
					.map(lang => lang.toLowerCase())
					.includes(language.toLowerCase())) { code = true }
			}
		}
		return ret.join("\n")
	}
}
