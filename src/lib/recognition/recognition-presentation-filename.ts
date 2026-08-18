/**
 * Download filename for a generated Recognition PPTX.
 * Year/month are not unique — event name is required so same-month events stay distinct.
 */

const UNSAFE_FILENAME_CHARS = /[\u0000-\u001f\u007f\\/:*?"<>|]/g;

export function sanitizeRecognitionPresentationFilename(name: string): string {
  const cleaned = name.replace(UNSAFE_FILENAME_CHARS, "-").replace(/\s+/g, " ").trim();
  const collapsed = cleaned.replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (!collapsed || collapsed === ".pptx") {
    return "表揚名單.pptx";
  }
  return collapsed.endsWith(".pptx") ? collapsed : `${collapsed}.pptx`;
}

export function recognitionPresentationAsciiFallbackFilename(filename: string): string {
  const ascii = filename
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (!ascii || ascii === ".pptx") {
    return "recognition.pptx";
  }
  return ascii.endsWith(".pptx") ? ascii : `${ascii}.pptx`;
}

export function recognitionPresentationFilename(event: {
  name: string;
  year: number;
  month: number;
}): string {
  const month = String(event.month).padStart(2, "0");
  const raw = `${event.year}-${month}-${event.name}-表揚名單.pptx`;
  return sanitizeRecognitionPresentationFilename(raw);
}
