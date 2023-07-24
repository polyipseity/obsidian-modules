import { EventEmitterLite } from "@polyipseity/obsidian-plugin-library"
import type { TFile } from "obsidian"
import { isUndefined } from "lodash-es"

export interface Transpile {
	readonly onInvalidate: EventEmitterLite<readonly []>
	readonly transpile: (content: string, file?: TFile) => string | null
}

abstract class AbstractTranspile implements Transpile {
	public readonly onInvalidate = new EventEmitterLite<readonly []>()
	public abstract transpile(content: string, file?: TFile): string | null
}

export class MarkdownTranspile
	extends AbstractTranspile
	implements Transpile {
	public override transpile(
		content: string,
		file?: TFile | undefined,
	): string | null {
		if (file?.extension !== "md") { return null }
		const ret = []
		let delimiter = "",
			code = false
		for (const line of content.split(/\r\n|[\n\v\f\r\x85\u2028\u2029]/u)) {
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
			const match = (/^(?<delimiter>`{3,}|~{3,})(?<language>.*)$/mu).exec(line)
			if (match) {
				const [, delimiter2, language] = match
				if (isUndefined(delimiter2) || isUndefined(language)) { continue }
				delimiter = delimiter2
				if (["JavaScript", "JS"]
					.map(lang => lang.toLowerCase())
					.includes(language.toLowerCase())) { code = true }
			}
		}
		return ret.join("\n")
	}
}
