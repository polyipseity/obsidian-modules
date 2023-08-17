import { type Options, parse, parseExpressionAt } from "acorn"
import { createProject, type ts } from "@ts-morph/bootstrap"
import type { CallExpression } from "estree"
import { generate } from "astring"
import { isNil } from "lodash-es"
import { normalizeURL } from "./util.js"
import { simple } from "acorn-walk"
import { worker } from "workerpool"

worker({ parseAndRewriteRequire, tsc }, {})

function escapeJavaScriptString(value: string): string {
	return `\`${value.replace(/(?<char>`|\\|\$)/ug, "\\$<char>")}\``
}

function dynamicRequireSync<T>(module: string): T {
	// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
	const ret: unknown = require(module)
	if (isNil(ret)) { throw new Error(module) }
	return ret as T
}

function importable(
	...args: Parameters<typeof dynamicRequireSync>
): boolean {
	try {
		dynamicRequireSync(...args)
		return true
	} catch (error) {
		self.console.debug(error)
		return false
	}
}

export async function tsc(input: tsc.Input): Promise<tsc.Output> {
	const { content, compilerOptions } = input,
		project = await createProject({
			compilerOptions: compilerOptions ?? {},
			useInMemoryFileSystem: true,
		}),
		source = project.createSourceFile("index.ts", content),
		program = project.createProgram()
	let result = null
	const { diagnostics } = program.emit(source, (filename, string) => {
		if (filename.endsWith("index.js")) { result = string }
	})
	// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
	if (result === null) {
		throw new Error(
			project.formatDiagnosticsWithColorAndContext(diagnostics),
		)
	}
	return result
}
export namespace tsc {
	export interface Input {
		readonly content: string
		readonly compilerOptions?: ts.CompilerOptions | undefined
	}
	export type Output = string
}

export function parseAndRewriteRequire(
	input: parseAndRewriteRequire.Input,
): parseAndRewriteRequire.Output {
	const requires: string[] = [],
		opts: Options = {
			allowAwaitOutsideFunction: false,
			allowHashBang: true,
			allowImportExportEverywhere: false,
			allowReserved: true,
			allowReturnOutsideFunction: false,
			allowSuperOutsideMethod: false,
			ecmaVersion: "latest",
			locations: false,
			preserveParens: false,
			ranges: false,
			sourceType: "script",
		},
		tree = parse(input.code, opts)
	simple(tree, {
		// eslint-disable-next-line @typescript-eslint/naming-convention
		CallExpression: node => {
			const node2 = node as CallExpression & typeof node,
				{ callee } = node2
			if (callee.type !== "Identifier" || callee.name !== "require") {
				return
			}
			const [arg0] = node2.arguments
			if (arg0?.type !== "Literal" || typeof arg0.value !== "string") {
				return
			}
			const { value } = arg0
			if (importable(value)) { return }
			let prefix = ""
			if (!(/^\.{0,2}\//u).test(value)) {
				try {
					// eslint-disable-next-line no-new
					new URL(value)
				} catch (error) {
					self.console.debug(error)
					prefix = "/"
				}
			}
			const value2 = normalizeURL(`${prefix}${value}`, input.href)
			if (value2 === null) { return }
			node2.callee = parseExpressionAt("self.require", 0, opts)
			arg0.raw = escapeJavaScriptString(value2)
			requires.push(arg0.value = value2)
		},
	})
	return {
		code: generate(tree, { comments: true, indent: "" }),
		requires,
	}
}
export namespace parseAndRewriteRequire {
	export interface Input {
		readonly code: string
		readonly href: string
	}
	export interface Output {
		readonly code: string
		readonly requires: readonly string[]
	}
}
