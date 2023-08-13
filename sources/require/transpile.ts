import {
	EventEmitterLite,
	splitLines,
} from "@polyipseity/obsidian-plugin-library"
import type { ModulesPlugin } from "../main.js"
import type { TFile } from "obsidian"
import { isUndefined } from "lodash-es"

export interface Transpile {
	readonly onInvalidate: EventEmitterLite<readonly []>
	readonly transpile: (content: string, file?: TFile) => string | null
}

abstract class AbstractTranspile implements Transpile {
	public readonly onInvalidate = new EventEmitterLite<readonly []>()

	public constructor(
		protected readonly context: ModulesPlugin,
	) { }

	public abstract transpile(content: string, file?: TFile): string | null
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
		file?: TFile | undefined,
	): string | null {
		if (file?.extension !== "md") { return null }
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
