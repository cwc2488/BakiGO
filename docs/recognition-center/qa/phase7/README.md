# Phase 7 visual QA artifacts

Temporary review files for the Recognition Center PPTX generator.

These are **not** application assets. They are not served by production routes.

## How they were produced

- Deck: `scripts/generate-recognition-phase7-qa.ts`
- Renderer: `renderRecognitionPresentationPptx` (current Phase 7 production renderer)
- Theme: `recognition_ceremony_navy_gold` v1 (current default)
- Slide size: **4:3** (10 in × 7.5 in)
- PNG previews: LibreOffice Impress headless export of the generated `.pptx` to PDF, then `pdftoppm` to PNG
- Names: fake `QA-` labels only
- Portraits: synthetic SVGs cropped with the production `cropRecognitionPortraitForPresentation` helper (right-biased 3:4 crop on a landscape original). No production storage photos.

## Files

| File | Case |
|---|---|
| `recognition-phase7-qa.pptx` | Complete 11-slide QA deck |
| `slide-01-name-few.png` | Name-only, 3 names |
| `slide-02-name-many.png` | Name-only, 18 names |
| `slide-03-photo-hero-1.png` | Photo hero, 1 person |
| `slide-04-photo-hero-2.png` | Photo hero, 2 people |
| `slide-05-photo-hero-3.png` | Photo hero, 3 people |
| `slide-06-photo-grid-6.png` | Photo grid, 6 people |
| `slide-07-photo-grid-12.png` | Photo grid, 12 people (4×3) |
| `slide-08-photo-grid-pagination-page1.png` | 17 people, page 1 of 2 (12) |
| `slide-09-photo-grid-pagination-page2.png` | 17 people, page 2 of 2 (5) |
| `slide-10-million-hero.png` | 百萬終生成就獎, 1 person |
| `slide-11-million-multiple.png` | 百萬終生成就獎, 2 people |
