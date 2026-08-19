import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import type PptxGenJS from "pptxgenjs";

export type PptxGenJsConstructor = typeof PptxGenJS;

/**
 * Load pptxgenjs through Node's CommonJS resolver.
 *
 * pptxgenjs@4 publishes two entries:
 * - exports.import → dist/pptxgen.es.js (ESM `import` syntax, package is not "type": "module")
 * - exports.require / main → dist/pptxgen.cjs.js (CJS `require`)
 *
 * A static `import PptxGenJS from "pptxgenjs"` in the Next.js server bundle
 * follows the ESM export. On Vercel Node serverless that file is then
 * executed as CJS → "Cannot use import statement outside a module".
 *
 * createRequire() uses the "require" export condition so Production loads
 * pptxgen.cjs.js. Keep pptxgenjs in serverExternalPackages so Turbopack
 * does not rewrite this back to the ESM entry.
 */
function pptxgenRequire(): NodeRequire {
  try {
    return createRequire(import.meta.url);
  } catch {
    return createRequire(pathToFileURL(`${process.cwd()}/package.json`).href);
  }
}

export function resolvePptxgenjsEntry(): string {
  return pptxgenRequire().resolve("pptxgenjs");
}

export function loadPptxGenJs(): PptxGenJsConstructor {
  const loaded = pptxgenRequire()("pptxgenjs") as PptxGenJsConstructor & {
    default?: PptxGenJsConstructor;
  };
  const ctor = loaded.default ?? loaded;
  if (typeof ctor !== "function") {
    throw new Error("pptxgenjs CJS entry did not export a constructor");
  }
  return ctor;
}
