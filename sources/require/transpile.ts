import {
	EventEmitterLite,
	splitLines,
} from "@polyipseity/obsidian-plugin-library"
import type { AsyncOrSync } from "ts-essentials"
import type { CacheIdentity } from "./resolve.js"
import type { ModulesPlugin } from "../main.js"
import { isUndefined } from "lodash-es"

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

export class MarkdownTranspile
	extends AbstractTranspile
	implements Transpile {
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

	public override atranspile(
		...args: Parameters<typeof this.transpile>
	): AsyncOrSync<ReturnType<typeof this.transpile>> {
		return this.transpile(...args)
	}
}
