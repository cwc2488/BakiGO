import type { Platform } from "../normalization/schema";
import type { CandidateSourceAdapter, SourceAdapterId } from "./types";
import { createProductionSourceAdapters } from "./fixture-adapter";
import type { SourceFetchAuditor } from "./types";

export { discoverPlatformsForKeyword, mapKeywordToPlatforms } from "../keywords/map-keyword-to-platforms";

const PLATFORM_ADAPTERS: Record<Platform, SourceAdapterId> = {
  threads: "threads_meta",
  instagram: "instagram_official",
};

export class SourceAdapterRegistry {
  private readonly adapters: Map<SourceAdapterId, CandidateSourceAdapter>;

  constructor(adapters: CandidateSourceAdapter[]) {
    this.adapters = new Map(adapters.map((adapter) => [adapter.id, adapter]));
  }

  get(id: SourceAdapterId): CandidateSourceAdapter {
    const adapter = this.adapters.get(id);
    if (!adapter) throw new Error(`Unknown source adapter: ${id}`);
    return adapter;
  }

  forPlatform(platform: Platform): CandidateSourceAdapter {
    return this.get(PLATFORM_ADAPTERS[platform]);
  }

  list(): CandidateSourceAdapter[] {
    return [...this.adapters.values()];
  }
}

export function createSourceAdapterRegistry(auditor?: SourceFetchAuditor): SourceAdapterRegistry {
  return new SourceAdapterRegistry(createProductionSourceAdapters(auditor));
}

