import {
  EventEmitterLite,
  type Fixed,
  cloneAsWritable,
  deepFreeze,
  dynamicRequire,
  dynamicRequireLazy,
  fixTyped,
  launderUnchecked,
  markFixed,
  splitLines,
} from "@polyipseity/obsidian-plugin-library";
import type { AsyncOrSync } from "ts-essentials";
import { BUNDLE } from "../import.js";
import type { ModulesPlugin } from "../main.js";
import type { TFile } from "obsidian";
import type { tsc } from "../worker.js";

const tsMorphBootstrap = dynamicRequire<typeof import("@ts-morph/bootstrap")>(
    BUNDLE,
    "@ts-morph/bootstrap"
  ),
  tsMorphBootstrapSync = dynamicRequireLazy<
    typeof import("@ts-morph/bootstrap")
  >(BUNDLE, "@ts-morph/bootstrap");

export interface Transpile {
  readonly onInvalidate: EventEmitterLite<readonly []>;
  readonly atranspile: (
    ...args: Parameters<Transpile["transpile"]>
  ) => AsyncOrSync<ReturnType<Transpile["transpile"]>>;
  readonly transpile: (
    id: object,
    content: string,
    file?: TFile
  ) => string | null;
  readonly invalidate: (id: object) => AsyncOrSync<void>;
}

interface ContentHeader {
  readonly language?: string | undefined;
  readonly compilerOptions?: object | undefined;
}
namespace ContentHeader {
  export const DEFAULT: ContentHeader = deepFreeze({});
  export function fix(self0: unknown): Fixed<ContentHeader> {
    const unc = launderUnchecked<ContentHeader>(self0);
    return markFixed(unc, {
      compilerOptions: fixTyped(DEFAULT, unc, "compilerOptions", [
        "object",
        "undefined",
      ]),
      language: fixTyped(DEFAULT, unc, "language", ["string", "undefined"]),
    });
  }
  export function parse(content: string): ContentHeader {
    const [, json] = /^\/\/(?<json>.*)$/mu.exec(content.trimStart()) ?? [];
    let ret: unknown = null;
    try {
      ret = JSON.parse(json ?? "{}");
    } catch (error) {
      /* @__PURE__ */ self.console.debug(error);
    }
    return fix(ret).value;
  }
}

abstract class AbstractTranspile implements Transpile {
  public readonly onInvalidate = new EventEmitterLite<readonly []>();

  public constructor(protected readonly context: ModulesPlugin) {}

  public abstract atranspile(
    ...args: Parameters<typeof this.transpile>
  ): AsyncOrSync<ReturnType<typeof this.transpile>>;

  public abstract transpile(
    id: object,
    content: string,
    file?: TFile
  ): string | null;

  public abstract invalidate(id: object): AsyncOrSync<void>;
}

export class TypeScriptTranspile
  extends AbstractTranspile
  implements Transpile
{
  protected readonly cache = new WeakMap<object, string>();
  protected readonly acache = new WeakMap<object, Promise<string | null>>();

  public constructor(
    context: ModulesPlugin,
    protected readonly workerPool = context.workerPool
  ) {
    super(context);
  }

  public override invalidate(id: object): void {
    this.cache.delete(id);
    this.acache.delete(id);
  }

  public override transpile(
    id: object,
    content: string,
    file?: TFile,
    header?: ContentHeader
  ): string | null {
    const ret = this.cache.get(id);
    if (ret !== void 0) {
      return ret;
    }
    const header2 = cloneAsWritable(header ?? ContentHeader.parse(content));
    if (
      header2.language === void 0 &&
      /^\.?m?ts$/u.test(file?.extension ?? "")
    ) {
      header2.language = "TypeScript";
    }
    if (header2.language !== "TypeScript") {
      return null;
    }
    const { createProjectSync, ts } = tsMorphBootstrapSync,
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
      program = project.createProgram();
    let ret2 = null;
    const { diagnostics } = program.emit(source, (filename, string) => {
      if (filename.endsWith("index.js")) {
        ret2 = string;
      }
    });

    if (ret2 === null) {
      throw new Error(
        project.formatDiagnosticsWithColorAndContext(diagnostics)
      );
    }
    this.cache.set(id, ret2);
    return ret2;
  }

  public override atranspile(
    id: object,
    content: string,
    file?: TFile,
    header?: ContentHeader
  ): AsyncOrSync<ReturnType<typeof this.transpile>> {
    let ret = this.acache.get(id);
    if (ret !== void 0) {
      return ret;
    }
    ret = (async (): Promise<string | null> => {
      const header2 = cloneAsWritable(header ?? ContentHeader.parse(content));
      if (
        header2.language === void 0 &&
        /^\.?m?ts$/u.test(file?.extension ?? "")
      ) {
        header2.language = "TypeScript";
      }
      if (header2.language !== "TypeScript") {
        return null;
      }
      const { ts } = await tsMorphBootstrap;
      return (await this.workerPool).exec<typeof tsc>("tsc", [
        {
          compilerOptions: {
            inlineSourceMap: true,
            inlineSources: true,
            module: ts.ModuleKind.NodeNext,
            target: ts.ScriptTarget.ESNext,
            ...header2.compilerOptions,
          },
          content,
        },
      ]);
    })();
    this.acache.set(id, ret);
    return ret;
  }
}

export class MarkdownTranspile extends AbstractTranspile implements Transpile {
  public constructor(
    context: ModulesPlugin,
    protected readonly tsTranspile: TypeScriptTranspile
  ) {
    super(context);
    const {
      context: { settings },
    } = this;
    context.register(
      settings.onMutate(
        (set) => set.markdownCodeBlockLanguagesToLoad,
        async () => this.onInvalidate.emit()
      )
    );
  }

  public override invalidate(id: object): void {
    this.tsTranspile.invalidate(id);
  }

  public override transpile(
    id: object,
    content: string,
    file?: TFile
  ): string | null {
    if (file?.extension !== "md") {
      return null;
    }
    const { tsTranspile } = this,
      ret = this.transpileMarkdown(content);
    return tsTranspile.transpile(id, ret, file, this.getHeader(file)) ?? ret;
  }

  public override async atranspile(
    id: object,
    content: string,
    file?: TFile
  ): Promise<ReturnType<typeof this.transpile>> {
    if (file?.extension !== "md") {
      return null;
    }
    const { tsTranspile } = this,
      ret = this.transpileMarkdown(content);
    return (
      (await tsTranspile.atranspile(id, ret, file, this.getHeader(file))) ?? ret
    );
  }

  protected getHeader(file: TFile): ContentHeader {
    const {
        context: {
          app: { metadataCache },
        },
      } = this,
      ret = ContentHeader.fix(
        metadataCache.getFileCache(file)?.frontmatter?.["module"]
      ).value;
    if (ret.language === void 0 && /\.m?ts$/u.test(file.basename)) {
      ret.language = "TypeScript";
    }
    return ret;
  }

  protected transpileMarkdown(content: string): string {
    const {
        context: { settings },
      } = this,
      ret = [];
    let delimiter = "",
      code = false;
    for (const line of splitLines(content)) {
      if (delimiter) {
        if (line.startsWith(delimiter)) {
          ret.push(`// ${line}`);
          delimiter = "";
          code = false;
          continue;
        }
        ret.push(code ? line : `// ${line}`);
        continue;
      }
      ret.push(`// ${line}`);
      const match = /^(?<delimiter>[`~]{3,})(?<language>.*)$/mu.exec(line);
      if (match) {
        const [, delimiter2, language] = match;
        if (delimiter2 === void 0 || language === void 0) {
          continue;
        }
        delimiter = delimiter2;
        if (
          settings.value.markdownCodeBlockLanguagesToLoad
            .map((lang) => lang.toLowerCase())
            .includes(language.toLowerCase())
        ) {
          code = true;
        }
      }
    }
    return ret.join("\n");
  }
}
