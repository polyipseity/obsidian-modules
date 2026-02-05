declare module "dataview" {
  // https://github.com/blacksmithgu/obsidian-dataview/blob/bb594a27ba1eed130d7c2ab7eff0990578e93f62/src/api/inline-api.ts#L39
  interface DataviewInlineApi {
    // https://github.com/blacksmithgu/obsidian-dataview/blob/bb594a27ba1eed130d7c2ab7eff0990578e93f62/src/api/inline-api.ts#L50
    readonly currentFilePath: string;
    // https://github.com/blacksmithgu/obsidian-dataview/blob/bb594a27ba1eed130d7c2ab7eff0990578e93f62/src/api/inline-api.ts#L317
    readonly view: (viewName: string, input: unknown) => PromiseLike<void>;
  }
  // https://github.com/blacksmithgu/obsidian-dataview/blob/bb594a27ba1eed130d7c2ab7eff0990578e93f62/src/main.ts#L18
  interface DataviewPlugin extends Plugin {
    // https://github.com/blacksmithgu/obsidian-dataview/blob/bb594a27ba1eed130d7c2ab7eff0990578e93f62/src/main.ts#L250
    readonly localApi: (
      path: string,
      component: Component,
      el: HTMLElement,
    ) => DataviewInlineApi;
  }
}
import type {} from "dataview";
import type { Component, Plugin } from "obsidian";
