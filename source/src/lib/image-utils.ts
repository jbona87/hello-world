import type { ReferenceImage, ReferenceRole } from "@/lib/types";

const MAX_SIDE = 1400;
const TARGET_BYTES = 330_000;
const MIN_QUALITY = 0.42;

function estimateDataUrlBytes(dataUrl: string): number {
  const base64 = dataUrl.split(",")[1] ?? "";
  return Math.ceil((base64.length * 3) / 4);
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The image could not be decoded."));
    image.src = src;
  });
}

export async function compressReference(
  file: File,
  role: ReferenceRole,
): Promise<ReferenceImage> {
  const raw = await readFile(file);
  const image = await loadImage(raw);

  let scale = Math.min(1, MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
  let quality = 0.82;
  let dataUrl = raw;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image compression is unavailable in this browser.");

    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    dataUrl = canvas.toDataURL("image/jpeg", quality);
    if (estimateDataUrlBytes(dataUrl) <= TARGET_BYTES) break;

    if (quality > MIN_QUALITY) {
      quality = Math.max(MIN_QUALITY, quality - 0.1);
    } else {
      scale *= 0.84;
    }
  }

  return {
    id: crypto.randomUUID(),
    name: file.name,
    dataUrl,
    role,
    compressedBytes: estimateDataUrlBytes(dataUrl),
  };
}

export function totalReferenceBytes(images: ReferenceImage[]): number {
  return images.reduce((sum, image) => sum + image.compressedBytes, 0);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
