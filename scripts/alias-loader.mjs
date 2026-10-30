/**
 * Node loader that resolves the app's `@/…` TypeScript aliases, so plain
 * `node --experimental-strip-types` can import `src/lib/**` without Vite.
 *
 * Only used by `npm run test:flow`; the app itself never imports this file.
 */
import { fileURLToPath } from "node:url";

const root = new URL("../src/", import.meta.url).href;

export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    return next(new URL(`${specifier.slice(2)}.ts`, root).href, context);
  }
  return next(specifier, context);
}

export function fileURL(value) {
  return fileURLToPath(value);
}
