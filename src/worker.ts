import { createProject, type ts } from "@ts-morph/bootstrap";
import { type Options, parse, parseExpressionAt } from "acorn";
import { simple } from "acorn-walk";
import { generate } from "astring";
import { worker } from "workerpool";
import { normalizeURL } from "./utils.js";

const obsidian = new Proxy<Record<string | number | symbol, unknown>>(
  {},
  {
    get(target, property, _receiver): unknown {
      // eslint-disable-next-line @typescript-eslint/no-extraneous-class -- a class is versatile enough to be used as a dummy class, a dummy function (since classes are functions), and a dummy object (since classes are objects)
      return (target[property] ??= class {});
    },
  },
);

// eslint-disable-next-line no-undef -- We are intentionally overriding the global `require` function to provide a custom implementation for the worker context. This is necessary because the worker does not have access to the Node.js `require` function, and we need to provide a way to load modules in this environment.
require = function fn(
  this: typeof self,
  ...args: Parameters<typeof window.require>
): ReturnType<typeof window.require> {
  const [id] = args;
  if (id === "obsidian") {
    return obsidian;
  }
  return null;
} as typeof window.require;
const library = import("@polyipseity/obsidian-plugin-library");

worker({ attachSourceMap, parseAndRewriteRequire, tsc }, {});

export async function attachSourceMap(
  input: attachSourceMap.Input,
): Promise<attachSourceMap.Output> {
  const { attachSourceMap: asm, attachFunctionSourceMap: afsm } = await library,
    { code, prefix, id, sourceRoot, type } = input;
  return { module: asm, script: afsm.bind(null, self.Function) }[type](
    `${prefix}${code}`,
    {
      deletions: prefix.split("").map((_0, idx) => ({
        column: idx,
        line: 1,
      })),
      file: id,
      sourceRoot: `${sourceRoot}${sourceRoot && "/"}${id}`,
    },
  );
}
export namespace attachSourceMap {
  export interface Input {
    readonly type: "module" | "script";
    readonly code: string;
    readonly prefix: string;
    readonly id: string;
    readonly sourceRoot: string;
  }
  export type Output = string;
}

export async function parseAndRewriteRequire(
  input: parseAndRewriteRequire.Input,
): Promise<parseAndRewriteRequire.Output> {
  const { importable, escapeJavaScriptString } = await library,
    { OPTIONS } = parseAndRewriteRequire,
    reqExpr = parseExpressionAt(input.requireExpression, 0, OPTIONS),
    requires: string[] = [],
    tree = parse(input.code, OPTIONS);
  simple(tree, {
    CallExpression: (node) => {
      const node2 = node,
        { callee } = node2;
      if (callee.type !== "Identifier" || callee.name !== "require") {
        return;
      }
      const [arg0] = node2.arguments;
      if (arg0?.type !== "Literal" || typeof arg0.value !== "string") {
        return;
      }
      const { value } = arg0;
      if (importable(new Map(), value)) {
        return;
      }
      let prefix = "";
      if (!/^\.{0,2}\//u.test(value)) {
        try {
          new URL(value);
        } catch (error) {
          /* @__PURE__ */ self.console.debug(error);
          prefix = "/";
        }
      }
      const value2 = normalizeURL(`${prefix}${value}`, input.href);
      if (value2 === null) {
        return;
      }
      node2.callee = reqExpr;
      arg0.raw = escapeJavaScriptString(value2);
      requires.push((arg0.value = value2));
    },
  });
  return {
    code: generate(tree, { comments: true, indent: "" }),
    requires,
  };
}
export namespace parseAndRewriteRequire {
  export const OPTIONS: Options = {
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
  };
  export interface Input {
    readonly code: string;
    readonly href: string;
    readonly requireExpression: string;
  }
  export interface Output {
    readonly code: string;
    readonly requires: readonly string[];
  }
}

export async function tsc(input: tsc.Input): Promise<tsc.Output> {
  const { content, compilerOptions } = input,
    project = await createProject({
      compilerOptions: compilerOptions ?? {},
      useInMemoryFileSystem: true,
    }),
    source = project.createSourceFile("index.ts", content),
    program = project.createProgram();
  const result: { value: string | null } = { value: null };
  const { diagnostics } = program.emit(source, (filename, string) => {
    if (filename.endsWith("index.js")) {
      result.value = string;
    }
  });

  if (result.value === null) {
    throw new Error(project.formatDiagnosticsWithColorAndContext(diagnostics));
  }
  return result.value;
}
export namespace tsc {
  export interface Input {
    readonly content: string;
    readonly compilerOptions?: ts.CompilerOptions | undefined;
  }
  export type Output = string;
}
