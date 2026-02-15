export function normalizeURL(id: string, cwd?: string): string | null {
  const { filter } = normalizeURL;
  let href = null;
  if (cwd !== void 0) {
    try {
      ({ href } = new URL(id, cwd));
      if (!filter.test(href)) {
        href = null;
      }
    } catch (error) {
      /* @__PURE__ */ self.console.debug(error);
    }
  }
  if (href === null) {
    try {
      ({ href } = new URL(id));
      if (!filter.test(href)) {
        href = null;
      }
    } catch (error) {
      /* @__PURE__ */ self.console.debug(error);
    }
  }
  return href;
}
export namespace normalizeURL {
  export const filter = /^https?:/u;
}
