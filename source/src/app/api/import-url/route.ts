import { NextResponse } from "next/server";
import ffmpegPath from "ffmpeg-static";
import sharp from "sharp";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

export const runtime = "nodejs";
export const maxDuration = 45;

const MAX_HTML_BYTES = 2_000_000;
const MAX_IMAGE_BYTES = 1_500_000;
const MAX_MEDIA = 6;
const MAX_VIDEO_FRAMES = 5;
const MAX_VIDEO_CANDIDATES = 12;
const MAX_VIDEO_BYTES = 20_000_000;
const PAGE_FETCH_TIMEOUT_MS = 7_000;
const IMAGE_FETCH_TIMEOUT_MS = 4_000;
const VIDEO_FETCH_TIMEOUT_MS = 9_000;
const FFMPEG_TIMEOUT_MS = 12_000;
const OPENAI_TIMEOUT_MS = 10_000;
const execFileAsync = promisify(execFile);

const BLOCKED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "169.254.169.254",
]);

type ImportedMedia = {
  name: string;
  dataUrl: string;
  sourceUrl: string;
  origin?: "video-frame" | "page-preview";
};

type VisualFingerprint = {
  averageHash: boolean[];
  differenceHash: boolean[];
};

type IdeaBrief = {
  creativeSummary: string;
  carouselSlides: Array<{
    slide: number;
    purpose: string;
    visualIdea: string;
    cameraOrComposition: string;
    poseOrAction: string;
  }>;
  reelBeats: Array<{
    beat: number;
    timing: string;
    visual: string;
    action: string;
    camera: string;
    transition: string;
  }>;
  reusableElements: string[];
  adaptationIdeas: string[];
};


function dataUrlBuffer(dataUrl: string) {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return Buffer.alloc(0);
  return Buffer.from(dataUrl.slice(comma + 1), "base64");
}

async function createVisualFingerprint(dataUrl: string): Promise<VisualFingerprint | null> {
  try {
    const buffer = dataUrlBuffer(dataUrl);
    if (!buffer.length) return null;

    const averagePixels = await sharp(buffer, { failOn: "none" })
      .resize(8, 8, { fit: "fill" })
      .grayscale()
      .raw()
      .toBuffer();
    const average = averagePixels.reduce((sum, value) => sum + value, 0) / averagePixels.length;
    const averageHash = Array.from(averagePixels, (value) => value >= average);

    const differencePixels = await sharp(buffer, { failOn: "none" })
      .resize(9, 8, { fit: "fill" })
      .grayscale()
      .raw()
      .toBuffer();
    const differenceHash: boolean[] = [];
    for (let row = 0; row < 8; row += 1) {
      for (let column = 0; column < 8; column += 1) {
        const offset = row * 9 + column;
        differenceHash.push(differencePixels[offset] > differencePixels[offset + 1]);
      }
    }

    return { averageHash, differenceHash };
  } catch {
    return null;
  }
}

function hammingDistance(left: boolean[], right: boolean[]) {
  const length = Math.min(left.length, right.length);
  let distance = Math.abs(left.length - right.length);
  for (let index = 0; index < length; index += 1) {
    if (left[index] !== right[index]) distance += 1;
  }
  return distance;
}

function visuallySimilar(left: VisualFingerprint, right: VisualFingerprint) {
  const averageDistance = hammingDistance(left.averageHash, right.averageHash);
  const differenceDistance = hammingDistance(left.differenceHash, right.differenceHash);
  return averageDistance <= 7 || differenceDistance <= 5;
}

async function deduplicateVisualMedia(items: ImportedMedia[], limit = MAX_MEDIA) {
  const kept: ImportedMedia[] = [];
  const fingerprints: VisualFingerprint[] = [];
  let duplicatesRemoved = 0;

  for (const item of items) {
    if (kept.length >= limit) break;
    const fingerprint = await createVisualFingerprint(item.dataUrl);
    if (fingerprint && fingerprints.some((existing) => visuallySimilar(existing, fingerprint))) {
      duplicatesRemoved += 1;
      continue;
    }
    kept.push(item);
    if (fingerprint) fingerprints.push(fingerprint);
  }

  return { media: kept, duplicatesRemoved };
}

function isPrivateHost(hostname: string) {
  const host = hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(host)) return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  const match = host.match(/^172\.(\d+)\./);
  if (match && Number(match[1]) >= 16 && Number(match[1]) <= 31) return true;
  return false;
}

function validatePublicUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("Only public HTTPS URLs are supported.");
  if (isPrivateHost(url.hostname)) throw new Error("Private or local network URLs are not supported.");
  return url;
}

function decodeHtml(value: string) {
  const named: Record<string, string> = {
    amp: "&",
    quot: '"',
    apos: "'",
    lt: "<",
    gt: ">",
    nbsp: " ",
  };

  let decoded = value;
  for (let pass = 0; pass < 3; pass += 1) {
    const next = decoded
      .replace(/&#x([0-9a-f]+);?/gi, (_, code: string) => {
        const point = Number.parseInt(code, 16);
        try { return Number.isFinite(point) ? String.fromCodePoint(point) : _; } catch { return _; }
      })
      .replace(/&#([0-9]+);?/g, (_, code: string) => {
        const point = Number.parseInt(code, 10);
        try { return Number.isFinite(point) ? String.fromCodePoint(point) : _; } catch { return _; }
      })
      .replace(/&([a-z]+);/gi, (entity, name: string) => named[name.toLowerCase()] ?? entity);
    if (next === decoded) break;
    decoded = next;
  }

  return decoded.replace(/\s+/g, " ").trim();
}

function metaValues(html: string, key: string) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "gi"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, "gi"),
  ];
  const values: string[] = [];
  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) values.push(decodeHtml(match[1].trim()));
  }
  return [...new Set(values)];
}

function titleFromHtml(html: string) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? decodeHtml(match[1].replace(/\s+/g, " ").trim()) : "";
}

function decodeEmbeddedUrl(value: string) {
  return decodeHtml(value)
    .replace(/\\u0026/gi, "&")
    .replace(/\\u002f/gi, "/")
    .replace(/\\\//g, "/")
    .replace(/\\u003d/gi, "=");
}

function toAbsoluteImageUrl(value: string, baseUrl: URL) {
  const cleaned = decodeEmbeddedUrl(value.trim());
  if (!cleaned || cleaned.startsWith("data:")) return "";
  try {
    const candidate = new URL(cleaned, baseUrl);
    if (candidate.protocol !== "https:") return "";
    if (isPrivateHost(candidate.hostname)) return "";
    return candidate.toString();
  } catch {
    return "";
  }
}

function collectJsonLdImages(html: string, baseUrl: URL) {
  const results: string[] = [];
  const scripts = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);

  const visit = (value: unknown, key = "") => {
    if (typeof value === "string") {
      if (["image", "thumbnail", "thumbnailurl", "contenturl"].includes(key.toLowerCase())) {
        const resolved = toAbsoluteImageUrl(value, baseUrl);
        if (resolved) results.push(resolved);
      }
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item, key);
      return;
    }
    if (value && typeof value === "object") {
      for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
        visit(childValue, childKey);
      }
    }
  };

  for (const match of scripts) {
    try { visit(JSON.parse(match[1])); } catch { /* Ignore malformed page JSON-LD. */ }
  }
  return results;
}

function collectEmbeddedMediaImages(html: string, baseUrl: URL) {
  const results: string[] = [];
  const decoded = decodeEmbeddedUrl(html);
  const keyedPatterns = [
    /["'](?:display_url|display_src|thumbnail_src|thumbnail_url|image_url|media_url|content_url)["']\s*:\s*["']([^"']+)["']/gi,
    /["']url["']\s*:\s*["'](https:\/\/[^"']+(?:\.jpe?g|\.png|\.webp)(?:\?[^"']*)?)["']/gi,
  ];

  for (const pattern of keyedPatterns) {
    for (const match of decoded.matchAll(pattern)) {
      const resolved = toAbsoluteImageUrl(match[1], baseUrl);
      if (resolved) results.push(resolved);
    }
  }

  // Instagram commonly stores carousel children in JSON under these keys.
  const carouselBlocks = decoded.matchAll(/["'](?:carousel_media|edge_sidecar_to_children)["']\s*:\s*(\{[\s\S]{0,250000}?\}|\[[\s\S]{0,250000}?\])/gi);
  for (const block of carouselBlocks) {
    for (const match of block[1].matchAll(/https:\/\/[^"'\s]+/gi)) {
      const resolved = toAbsoluteImageUrl(match[0], baseUrl);
      if (resolved) results.push(resolved);
    }
  }

  return results;
}


function collectEmbeddedVideoUrls(html: string, baseUrl: URL) {
  const results: string[] = [];
  const decoded = decodeEmbeddedUrl(html);
  const patterns = [
    /["'](?:video_url|videoUrl|playback_url|playbackUrl|content_url|contentUrl|browser_native_hd_url|browser_native_sd_url)["']\s*:\s*["']([^"']+)["']/gi,
    /(https:\/\/[^"'\s]+\.mp4(?:\?[^"'\s]*)?)/gi,
  ];
  for (const pattern of patterns) {
    for (const match of decoded.matchAll(pattern)) {
      const resolved = toAbsoluteImageUrl(match[1], baseUrl);
      if (resolved) results.push(resolved);
    }
  }
  return [...new Set(results)];
}

function rankVideoCandidates(candidates: string[], platform: string) {
  return [...new Set(candidates)]
    .filter(Boolean)
    .sort((a, b) => {
      const score = (value: string) => {
        let total = 0;
        if (/\.mp4(?:[?#]|$)/i.test(value)) total += 5;
        if (/cdninstagram|fbcdn|scontent/i.test(value)) total += platform === "Instagram" ? 5 : 1;
        if (/video/i.test(value)) total += 2;
        return total;
      };
      return score(b) - score(a);
    });
}

async function extractVideoFrames(videoUrl: string, sourcePageUrl: string): Promise<ImportedMedia[]> {
  if (!ffmpegPath) return [];
  const ffmpegBinary: string = ffmpegPath;
  const validated = validatePublicUrl(videoUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VIDEO_FETCH_TIMEOUT_MS);
  let directory = "";
  try {
    const response = await fetch(validated.toString(), {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; PromptLens/2.5; +https://promptlens-woad.vercel.app)",
        Accept: "video/mp4,video/*;q=0.9,*/*;q=0.5",
        Referer: sourcePageUrl,
      },
    });
    if (!response.ok) return [];
    const length = Number(response.headers.get("content-length") || 0);
    if (length && length > MAX_VIDEO_BYTES) return [];
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.byteLength || bytes.byteLength > MAX_VIDEO_BYTES) return [];

    directory = await mkdtemp(path.join(os.tmpdir(), "promptlens-video-"));
    const inputPath = path.join(directory, "input.mp4");
    await writeFile(inputPath, bytes);

    const run = async (filter: string, outputPattern: string, frames = MAX_VIDEO_CANDIDATES) => {
      await execFileAsync(
        ffmpegBinary,
        [
          "-hide_banner", "-loglevel", "error", "-i", inputPath,
          "-vf", filter,
          "-fps_mode", "vfr",
          "-frames:v", String(frames),
          "-q:v", "3",
          outputPattern,
        ],
        { timeout: FFMPEG_TIMEOUT_MS, maxBuffer: 1_000_000 },
      );
    };

    try {
      await run(
        "select=eq(n\\,0)+gt(scene\\,0.30),mpdecimate=hi=768:lo=320:frac=0.30,scale=720:-2",
        path.join(directory, "scene-%02d.jpg"),
      );
    } catch {
      // Uniform samples below can still recover visually distinct moments.
    }

    let files = (await readdir(directory)).filter((name) => /^scene-\d+\.jpg$/i.test(name)).sort();
    if (files.length < MAX_VIDEO_FRAMES) {
      try {
        await run(
          "fps=1/1.25,mpdecimate=hi=768:lo=320:frac=0.30,scale=720:-2",
          path.join(directory, "sample-%02d.jpg"),
        );
      } catch {
        // Return any scene frames that were already produced.
      }
      const sampled = (await readdir(directory)).filter((name) => /^sample-\d+\.jpg$/i.test(name)).sort();
      files = [...files, ...sampled];
    }

    const candidates = await Promise.all(files.slice(0, MAX_VIDEO_CANDIDATES * 2).map(async (name, index) => {
      const frame = await readFile(path.join(directory, name));
      return {
        name: `reel-shot-${String(index + 1).padStart(2, "0")}.jpg`,
        dataUrl: `data:image/jpeg;base64,${frame.toString("base64")}`,
        sourceUrl: validated.toString(),
        origin: "video-frame" as const,
      };
    }));

    return (await deduplicateVisualMedia(candidates, MAX_VIDEO_FRAMES)).media;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
    if (directory) await rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
}

function collectHtmlImageSources(html: string, baseUrl: URL) {
  const results: string[] = [];
  const tags = html.matchAll(/<img\b[^>]*>/gi);
  for (const tagMatch of tags) {
    const tag = tagMatch[0];
    const attrs = ["src", "data-src", "data-lazy-src", "data-original"];
    for (const attr of attrs) {
      const match = tag.match(new RegExp(`${attr}=["']([^"']+)["']`, "i"));
      if (!match) continue;
      const resolved = toAbsoluteImageUrl(match[1], baseUrl);
      if (resolved) results.push(resolved);
    }
    const srcset = tag.match(/(?:srcset|data-srcset)=["']([^"']+)["']/i)?.[1];
    if (srcset) {
      for (const item of srcset.split(",")) {
        const candidate = item.trim().split(/\s+/)[0];
        const resolved = toAbsoluteImageUrl(candidate, baseUrl);
        if (resolved) results.push(resolved);
      }
    }
  }
  return results;
}

function rankImageCandidates(candidates: string[], platform: string) {
  const unique = [...new Set(candidates)];
  return unique
    .filter((candidate) => !/(?:logo|avatar|profile_pic|favicon|emoji|sprite|icon)/i.test(candidate))
    .sort((a, b) => {
      const score = (value: string) => {
        let total = 0;
        if (/cdninstagram|fbcdn|scontent/i.test(value)) total += platform === "Instagram" ? 8 : 2;
        if (/\.(?:jpe?g|png|webp)(?:[?#]|$)/i.test(value)) total += 4;
        if (/(?:1080|1440|2048|original|large)/i.test(value)) total += 2;
        if (/(?:150x150|320x320|thumbnail|thumb)/i.test(value)) total -= 3;
        return total;
      };
      return score(b) - score(a);
    });
}

function classifyUrl(url: URL, html = "") {
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  const path = url.pathname.toLowerCase();
  if (host.endsWith("instagram.com")) {
    if (path.includes("/reel/") || path.includes("/reels/")) return { platform: "Instagram", contentType: "reel" };
    if (path.includes("/p/")) return { platform: "Instagram", contentType: "carousel-or-post" };
    return { platform: "Instagram", contentType: "profile-or-page" };
  }
  if (host.endsWith("tiktok.com")) return { platform: "TikTok", contentType: "short-video" };
  if (host.endsWith("pinterest.com") || host.endsWith("pin.it")) return { platform: "Pinterest", contentType: "pin" };
  if (host.endsWith("youtube.com") || host === "youtu.be") return { platform: "YouTube", contentType: path.includes("/shorts/") ? "short-video" : "video" };
  const type = metaValues(html, "og:type")[0] || "webpage";
  return { platform: host, contentType: type };
}

async function fetchWithLimit(url: string, maxBytes: number, timeoutMs = PAGE_FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; PromptLens/2.4; +https://promptlens-woad.vercel.app)",
        Accept: "text/html,application/xhtml+xml,image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      },
    });
    if (!response.ok) throw new Error(`The URL returned HTTP ${response.status}.`);
    const length = Number(response.headers.get("content-length") || 0);
    if (length && length > maxBytes) throw new Error("The remote file is too large for URL import.");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maxBytes) throw new Error("The remote response exceeded the import limit.");
    return { response, bytes };
  } finally {
    clearTimeout(timer);
  }
}

async function imageToDataUrl(url: string): Promise<ImportedMedia | null> {
  try {
    const validated = validatePublicUrl(url);
    const { response, bytes } = await fetchWithLimit(validated.toString(), MAX_IMAGE_BYTES, IMAGE_FETCH_TIMEOUT_MS);
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) return null;
    return {
      name: validated.pathname.split("/").filter(Boolean).pop() || "url-reference",
      dataUrl: `data:${contentType.split(";")[0]};base64,${Buffer.from(bytes).toString("base64")}`,
      sourceUrl: validated.toString(),
      origin: "page-preview",
    };
  } catch {
    return null;
  }
}

function basicIdeas(contentType: string, title: string, description: string): IdeaBrief {
  const context = [title, description].filter(Boolean).join(" — ") || "Public visual reference";
  return {
    creativeSummary: `Use the visible concept and pacing from ${context}, while creating an original shoot rather than copying the source exactly.`,
    carouselSlides: [
      { slide: 1, purpose: "Hook", visualIdea: "Strong hero frame that establishes the subject and visual world.", cameraOrComposition: "Clean, high-impact composition with immediate subject recognition.", poseOrAction: "Confident primary pose or decisive opening action." },
      { slide: 2, purpose: "Detail", visualIdea: "Closer crop showing styling, texture, product or facial detail.", cameraOrComposition: "Tighter framing with controlled depth and clear focal priority.", poseOrAction: "Subtle hand interaction or natural micro-expression." },
      { slide: 3, purpose: "Variation", visualIdea: "Change angle, body orientation or environment while retaining the same Shoot DNA.", cameraOrComposition: "Three-quarter or environmental composition.", poseOrAction: "Natural weight shift or mid-movement transition." },
      { slide: 4, purpose: "Closing image", visualIdea: "Memorable final frame with stronger mood or negative space.", cameraOrComposition: "Editorial closing composition suitable for text or branding.", poseOrAction: "Quiet final gesture or look away." },
    ],
    reelBeats: [
      { beat: 1, timing: "0–2s", visual: "Immediate visual hook", action: "Subject enters, turns or reveals the styling", camera: "Fast push-in or decisive locked frame", transition: "Cut on movement" },
      { beat: 2, timing: "2–5s", visual: "Primary look and pose", action: "Controlled natural movement", camera: "Medium tracking or gentle orbit", transition: "Match cut" },
      { beat: 3, timing: "5–8s", visual: "Close detail", action: "Hair, fabric, hands or product interaction", camera: "Close-up with stable focus", transition: "Detail cut" },
      { beat: 4, timing: "8–12s", visual: "Final hero frame", action: "Settle into the strongest pose", camera: "Slow pull-back or still finish", transition: "Hold for final frame" },
    ],
    reusableElements: ["visual hook", "consistent styling", "clear shot progression", "realistic camera movement"],
    adaptationIdeas: [`Adapt the ${contentType} into a portrait series`, "Keep the concept but change wardrobe, location and pose sequence", "Use the final beat as the carousel cover"],
  };
}

async function generateIdeas(input: {
  sourceUrl: string;
  platform: string;
  contentType: string;
  title: string;
  description: string;
  imageDataUrls: string[];
}): Promise<IdeaBrief> {
  if (!process.env.OPENAI_API_KEY) return basicIdeas(input.contentType, input.title, input.description);

  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["creativeSummary", "carouselSlides", "reelBeats", "reusableElements", "adaptationIdeas"],
    properties: {
      creativeSummary: { type: "string" },
      carouselSlides: {
        type: "array",
        minItems: 4,
        maxItems: 8,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["slide", "purpose", "visualIdea", "cameraOrComposition", "poseOrAction"],
          properties: {
            slide: { type: "integer" }, purpose: { type: "string" }, visualIdea: { type: "string" }, cameraOrComposition: { type: "string" }, poseOrAction: { type: "string" },
          },
        },
      },
      reelBeats: {
        type: "array",
        minItems: 4,
        maxItems: 8,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["beat", "timing", "visual", "action", "camera", "transition"],
          properties: {
            beat: { type: "integer" }, timing: { type: "string" }, visual: { type: "string" }, action: { type: "string" }, camera: { type: "string" }, transition: { type: "string" },
          },
        },
      },
      reusableElements: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 8 },
      adaptationIdeas: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 8 },
    },
  };

  const content: Array<Record<string, unknown>> = [
    {
      type: "input_text",
      text: `Create an original carousel and Reel idea breakdown inspired by this public URL metadata. Do not claim to have seen frames that were not supplied. Source: ${input.sourceUrl}\nPlatform: ${input.platform}\nContent type: ${input.contentType}\nTitle: ${input.title}\nDescription: ${input.description}\nKeep camera, pose and movement ideas physically realistic.`,
    },
    ...input.imageDataUrls.slice(0, 4).map((image_url) => ({ type: "input_image", image_url, detail: "low" })),
  ];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: process.env.OPENAI_FAST_MODEL || "gpt-5-nano",
        input: [{ role: "user", content }],
        text: { format: { type: "json_schema", name: "url_idea_brief", strict: true, schema } },
        max_output_tokens: 2_500,
      }),
    });
    const payload = await response.json();
    if (!response.ok) return basicIdeas(input.contentType, input.title, input.description);
    const text = payload.output_text || payload.output?.flatMap((item: { content?: Array<{ text?: string }> }) => item.content || []).map((item: { text?: string }) => item.text || "").join("") || "";
    try { return JSON.parse(text) as IdeaBrief; } catch { return basicIdeas(input.contentType, input.title, input.description); }
  } catch {
    return basicIdeas(input.contentType, input.title, input.description);
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { url?: string };
    if (!body.url?.trim()) return NextResponse.json({ error: "Paste a public URL first." }, { status: 400 });
    const url = validatePublicUrl(body.url.trim());

    let direct: Awaited<ReturnType<typeof fetchWithLimit>>;
    try {
      direct = await fetchWithLimit(url.toString(), MAX_HTML_BYTES, PAGE_FETCH_TIMEOUT_MS);
    } catch {
      const classification = classifyUrl(url);
      return NextResponse.json({
        sourceUrl: url.toString(),
        ...classification,
        title: url.hostname,
        description: "The public preview could not be fetched quickly enough, so PromptLens created a URL-only creative brief.",
        media: [],
        ideas: basicIdeas(classification.contentType, url.hostname, "URL-only concept reference"),
        limitations: [
          "The source page did not expose a preview within the safe import time limit.",
          "You can still continue with the URL-only brief or upload screenshots for visual analysis.",
        ],
      });
    }
    const contentType = direct.response.headers.get("content-type") || "";
    if (contentType.startsWith("image/")) {
      const media: ImportedMedia = {
        name: url.pathname.split("/").filter(Boolean).pop() || "url-reference",
        dataUrl: `data:${contentType.split(";")[0]};base64,${Buffer.from(direct.bytes).toString("base64")}`,
        sourceUrl: url.toString(),
        origin: "page-preview",
      };
      const classification = classifyUrl(url);
      const ideas = await generateIdeas({ sourceUrl: url.toString(), ...classification, title: media.name, description: "Direct image URL", imageDataUrls: [media.dataUrl] });
      return NextResponse.json({ sourceUrl: url.toString(), ...classification, title: media.name, description: "Direct image URL", media: [media], ideas, limitations: [] });
    }

    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
      return NextResponse.json({
        sourceUrl: url.toString(),
        ...classifyUrl(url),
        title: url.hostname,
        description: "The URL points to media that cannot be frame-extracted inside a standard Vercel request.",
        media: [],
        ideas: basicIdeas("video", url.hostname, "Direct video or unsupported media URL"),
        limitations: ["Upload the video file directly for exact keyframe analysis.", "URL-only video imports currently generate ideas from metadata rather than every frame."],
      });
    }

    const html = new TextDecoder().decode(direct.bytes);
    const initialClassification = classifyUrl(url, html);
    const title = metaValues(html, "og:title")[0] || metaValues(html, "twitter:title")[0] || titleFromHtml(html) || url.hostname;
    const description = metaValues(html, "og:description")[0] || metaValues(html, "description")[0] || metaValues(html, "twitter:description")[0] || "";
    const videoCandidates = rankVideoCandidates(
      [
        ...metaValues(html, "og:video"),
        ...metaValues(html, "og:video:secure_url"),
        ...metaValues(html, "twitter:player:stream"),
        ...collectEmbeddedVideoUrls(html, url),
      ]
        .map((value) => toAbsoluteImageUrl(value, url))
        .filter(Boolean),
      initialClassification.platform,
    );
    const classification = videoCandidates.length
      ? { ...initialClassification, contentType: initialClassification.platform === "Instagram" ? "reel-or-video-post" : "video" }
      : initialClassification;
    const metaImages = [...metaValues(html, "og:image"), ...metaValues(html, "twitter:image")]
      .map((value) => toAbsoluteImageUrl(value, url))
      .filter(Boolean);
    const jsonLdImages = collectJsonLdImages(html, url);
    const embeddedImages = collectEmbeddedMediaImages(html, url);
    const htmlImages = collectHtmlImageSources(html, url);
    const imageCandidates = rankImageCandidates(
      [...metaImages, ...jsonLdImages, ...embeddedImages, ...htmlImages],
      classification.platform,
    );

    const uniqueImages = imageCandidates.slice(0, MAX_MEDIA * 2);
    const rawPreviewMedia = (await Promise.all(uniqueImages.map(imageToDataUrl))).filter((item): item is ImportedMedia => Boolean(item));
    const previewResult = await deduplicateVisualMedia(rawPreviewMedia, MAX_MEDIA);
    const previewMedia = previewResult.media;
    const videoFrames = videoCandidates[0] ? await extractVideoFrames(videoCandidates[0], url.toString()) : [];

    // Real Reel timeline frames have priority. Public page previews are only used
    // when they add a visually distinct composition, never to pad the result.
    const combinedResult = await deduplicateVisualMedia(
      videoFrames.length ? [...videoFrames, ...previewMedia] : previewMedia,
      MAX_MEDIA,
    );
    const media = combinedResult.media;
    const duplicatesRemoved = previewResult.duplicatesRemoved + combinedResult.duplicatesRemoved;
    const ideas = await generateIdeas({ sourceUrl: url.toString(), ...classification, title, description, imageDataUrls: media.map((item) => item.dataUrl) });

    const limitations: string[] = [];
    if (duplicatesRemoved > 0) {
      limitations.push(`${duplicatesRemoved} repeated or near-identical preview${duplicatesRemoved === 1 ? " was" : "s were"} removed automatically.`);
    }
    if (videoCandidates.length && videoFrames.length) {
      limitations.push(`${videoFrames.length} distinct timeline frames were sampled from the public video file.`);
    } else if (videoCandidates.length) {
      limitations.push("A public video URL was detected, but its timeline could not be sampled within the safe import limit. Upload key screenshots from the Reel for exact shot extraction.");
    }
    if (classification.platform === "Instagram") {
      if (classification.contentType === "carousel-or-post" && media.length <= 1) {
        limitations.push("Only the public carousel cover was exposed. Instagram did not provide the remaining slide files to the unauthenticated page request.");
        limitations.push("Use Add missing slides to upload screenshots or exported carousel images; PromptLens will analyse them together with the URL.");
      } else if (classification.contentType === "carousel-or-post" && media.length > 1) {
        limitations.push(`${media.length} public carousel previews were recovered. Instagram may still hide additional slides.`);
      } else if (!videoFrames.length) {
        limitations.push("Instagram exposed only still previews from this video post. The number of detected previews is not the number of shots in the Reel.");
      }
      limitations.push("Private, age-restricted and login-only posts cannot be imported.");
    }
    if (!media.length) limitations.push("No public preview image was exposed by the page.");

    return NextResponse.json({ sourceUrl: url.toString(), ...classification, title, description, media, ideas, limitations, videoDetected: Boolean(videoCandidates.length), videoFrameCount: videoFrames.length, duplicatesRemoved });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The URL could not be imported." }, { status: 400 });
  }
}
