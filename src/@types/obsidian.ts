/* eslint-disable @typescript-eslint/no-empty-object-type */
declare module "obsidian" {
  interface Canvas extends Private<$Canvas, PrivateKey> {}
  interface CanvasNode extends Private<$CanvasNode, PrivateKey> {}
  interface CanvasNodeInfo extends Private<$CanvasNodeInfo, PrivateKey> {}
  interface MarkdownEmbedInfo extends Private<$MarkdownEmbedInfo, PrivateKey> {}
  interface MarkdownFileInfo extends Private<unknown, PrivateKey> {}
  interface MarkdownPreviewRenderer
    extends Private<$MarkdownPreviewRenderer, PrivateKey> {}
  namespace Plugins {
    interface Mapping {
      readonly dataview: DataviewPlugin;

      readonly "templater-obsidian": TemplaterPlugin;
    }
  }
}
import type {
  Canvas,
  CanvasNode,
  CanvasNodeInfo,
  FileView,
  MarkdownEmbedInfo,
  MarkdownFileInfo,
} from "obsidian";
import type { DataviewPlugin } from "dataview";
import type { Private } from "@polyipseity/obsidian-plugin-library";
import type { TemplaterPlugin } from "templater-obsidian";

declare const PRIVATE_KEY: unique symbol;
type PrivateKey = typeof PRIVATE_KEY;
declare module "@polyipseity/obsidian-plugin-library" {
  interface PrivateKeys {
    readonly [PRIVATE_KEY]: never;
  }
}

interface $Canvas {
  readonly view: FileView;
}

interface $CanvasNode {
  readonly canvas: Canvas;
}

interface $CanvasNodeInfo extends MarkdownFileInfo {
  readonly node: CanvasNode;
}

interface $MarkdownEmbedInfo extends MarkdownFileInfo {
  readonly owner: CanvasNodeInfo | MarkdownFileInfo;
}

interface $MarkdownPreviewRenderer {
  readonly owner: MarkdownEmbedInfo | MarkdownFileInfo;
  readonly onRender: () => void;
}
