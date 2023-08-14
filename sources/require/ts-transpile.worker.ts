import { createProject, ts } from "@ts-morph/bootstrap"
import { worker } from "workerpool"

worker({ run }, {})
export interface WorkerInput {
	readonly content: string
	readonly compilerOptions?: object | undefined
}
export type WorkerOutput = string

export async function run(input: WorkerInput): Promise<WorkerOutput> {
	const { content, compilerOptions } = input,
		project = await createProject({
			compilerOptions: {
				inlineSourceMap: true,
				inlineSources: true,
				module: ts.ModuleKind.NodeNext,
				target: ts.ScriptTarget.ESNext,
				...compilerOptions,
			},
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
