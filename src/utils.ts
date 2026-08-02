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

/**
 * Checks if `value` is a non-null object or a function, matching the semantics
 * of lodash `isObject`.
 */
export function isObject(value: unknown): value is object {
  return typeof value === "object"
    ? value !== null
    : typeof value === "function";
}
