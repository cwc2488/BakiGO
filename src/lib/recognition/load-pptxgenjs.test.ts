import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadPptxGenJs, resolvePptxgenjsEntry } from "@/lib/recognition/load-pptxgenjs";

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("pptxgenjs Node runtime loading", () => {
  it("resolves the CommonJS entry, not pptxgen.es.js", () => {
    const resolved = resolvePptxgenjsEntry();
    expect(resolved.replaceAll("\\", "/")).toContain("pptxgen.cjs.js");
    expect(resolved).not.toContain("pptxgen.es.js");
  });

  it("constructs a presentation from the CJS export", () => {
    const Ctor = loadPptxGenJs();
    const pptx = new Ctor();
    expect(typeof pptx.addSlide).toBe("function");
    expect(typeof pptx.write).toBe("function");
  });

  it("keeps the renderer free of a static ESM pptxgenjs import", () => {
    const pptx = read("src/lib/recognition/recognition-presentation-pptx.ts");
    const loader = read("src/lib/recognition/load-pptxgenjs.ts");
    const config = read("next.config.ts");
    const route = read("src/app/api/recognition/events/[eventId]/presentation/route.ts");

    expect(pptx).not.toMatch(/from ["']pptxgenjs["']/);
    expect(pptx).not.toContain("pptxgen.es.js");
    expect(pptx).toContain("loadPptxGenJs");
    expect(loader).toContain("createRequire");
    expect(loader).toContain("pptxgen.cjs.js");
    expect(config).toContain("pptxgenjs");
    expect(config).toContain("jszip");
    expect(route).toContain('export const runtime = "nodejs"');
    expect(route).not.toMatch(/runtime\s*=\s*["']edge["']/);
  });
});
