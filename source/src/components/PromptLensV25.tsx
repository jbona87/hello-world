"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { compressReference, formatBytes, totalReferenceBytes } from "@/lib/image-utils";
import { buildPromptOutput } from "@/lib/prompt-builder";
import {
  DEFAULT_CONFIG,
  GENERATORS,
  PROJECT_TYPES,
  PROMPT_OPTIONS,
  SUBJECT_PROFILE_OPTIONS,
} from "@/lib/presets";
import type {
  AnalysisResult,
  PromptConfig,
  PortraitValidation,
  ReferenceImage,
  SavedShoot,
  SubjectPhysicalProfile,
} from "@/lib/types";

type Screen = "source" | "identity" | "direction" | "processing" | "result";
type ResultTab = "prompt" | "short" | "negative" | "shot" | "advanced";
type SourceMode = "url" | "upload" | "manual" | null;
type UrlSectionKey =
  | "media"
  | "summary"
  | "camera"
  | "pose"
  | "carousel"
  | "reel"
  | "elements"
  | "adaptations";
type OutputChoice = "image" | "carousel" | "reel" | "video";
type Status = "checking" | "connected" | "missing" | "offline";
type DrawerGroupKey = "pose" | "camera" | "lighting" | "outfit" | "location" | "finish";

type UrlIdeaBrief = {
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

type UrlImportResult = {
  sourceUrl: string;
  platform: string;
  contentType: string;
  title: string;
  description: string;
  media: Array<{ name: string; dataUrl: string; sourceUrl: string }>;
  ideas: UrlIdeaBrief;
  limitations: string[];
  videoDetected?: boolean;
  videoFrameCount?: number;
};

type ConfigFieldKey = keyof Pick<
  PromptConfig,
  | "pose"
  | "mainPosition"
  | "bodyOrientation"
  | "weightDistribution"
  | "headPosition"
  | "armPosition"
  | "handPosition"
  | "movement"
  | "poseEnergy"
  | "expression"
  | "gaze"
  | "shotSize"
  | "composition"
  | "cropRule"
  | "camera"
  | "cameraFormat"
  | "lens"
  | "aperture"
  | "shutterSpeed"
  | "iso"
  | "cameraDistance"
  | "cameraAngle"
  | "focusPlane"
  | "depthOfField"
  | "lighting"
  | "lightSource"
  | "lightModifier"
  | "lightDirection"
  | "lightQuality"
  | "fillLevel"
  | "separationLight"
  | "wardrobe"
  | "wardrobeCategory"
  | "mainGarment"
  | "silhouette"
  | "material"
  | "stylingState"
  | "footwear"
  | "accessories"
  | "background"
  | "locationCategory"
  | "surface"
  | "timeOfDay"
  | "weather"
  | "environmentalDepth"
  | "props"
  | "realism"
  | "mood"
  | "makeup"
  | "hair"
  | "colourGrade"
  | "retouching"
  | "grain"
  | "aspectRatio"
>;

type DrawerGroup = {
  title: string;
  description: string;
  fields: Array<{ key: ConfigFieldKey; label: string; options: readonly string[] }>;
};

const MAX_REFERENCES = 6;
const MAX_SOURCE_REFERENCES = 5;
const MAX_TOTAL_BYTES = 2_250_000;
const CONFIG_KEY = "promptlens-v2-5-config";
const SHOOTS_KEY = "promptlens-v2-5-shoots";
const PROFILE_KEY = "promptlens-v2-5-profiles";

const URL_SECTION_LABELS: Record<UrlSectionKey, { title: string; description: string }> = {
  media: { title: "Source images", description: "Use every publicly available preview as a shot reference." },
  summary: { title: "Creative summary", description: "Carry over the central visual idea and pacing." },
  camera: { title: "Camera and composition", description: "Use detected framing, angles and shot progression." },
  pose: { title: "Pose and action", description: "Use body language, movement and gesture cues." },
  carousel: { title: "Carousel structure", description: "Build the image sequence slide by slide." },
  reel: { title: "Reel structure", description: "Use timing, camera movement and transitions." },
  elements: { title: "Reusable style elements", description: "Carry over recurring visual details and rhythm." },
  adaptations: { title: "Adaptation ideas", description: "Add original ways to evolve the source concept." },
};

const DRAWER_GROUPS: Record<DrawerGroupKey, DrawerGroup> = {
  pose: {
    title: "Pose",
    description: "Body mechanics, expression and gesture.",
    fields: [
      { key: "pose", label: "Pose direction", options: PROMPT_OPTIONS.pose },
      { key: "mainPosition", label: "Main position", options: PROMPT_OPTIONS.mainPosition },
      { key: "bodyOrientation", label: "Body orientation", options: PROMPT_OPTIONS.bodyOrientation },
      { key: "weightDistribution", label: "Weight and support", options: PROMPT_OPTIONS.weightDistribution },
      { key: "headPosition", label: "Head and chin", options: PROMPT_OPTIONS.headPosition },
      { key: "handPosition", label: "Hands", options: PROMPT_OPTIONS.handPosition },
      { key: "expression", label: "Expression", options: PROMPT_OPTIONS.expression },
      { key: "gaze", label: "Gaze", options: PROMPT_OPTIONS.gaze },
    ],
  },
  camera: {
    title: "Camera",
    description: "Framing, perspective, focus and optical realism.",
    fields: [
      { key: "shotSize", label: "Framing", options: PROMPT_OPTIONS.shotSize },
      { key: "lens", label: "Lens", options: PROMPT_OPTIONS.lens },
      { key: "aperture", label: "Aperture", options: PROMPT_OPTIONS.aperture },
      { key: "cameraAngle", label: "Camera angle", options: PROMPT_OPTIONS.cameraAngle },
      { key: "cameraDistance", label: "Camera distance", options: PROMPT_OPTIONS.cameraDistance },
      { key: "focusPlane", label: "Focus priority", options: PROMPT_OPTIONS.focusPlane },
      { key: "depthOfField", label: "Depth of field", options: PROMPT_OPTIONS.depthOfField },
      { key: "composition", label: "Composition", options: PROMPT_OPTIONS.composition },
    ],
  },
  lighting: {
    title: "Lighting",
    description: "One motivated key light with coherent shadows and catchlights.",
    fields: [
      { key: "lighting", label: "Lighting preset", options: PROMPT_OPTIONS.lighting },
      { key: "lightSource", label: "Source", options: PROMPT_OPTIONS.lightSource },
      { key: "lightModifier", label: "Modifier", options: PROMPT_OPTIONS.lightModifier },
      { key: "lightDirection", label: "Direction", options: PROMPT_OPTIONS.lightDirection },
      { key: "lightQuality", label: "Quality", options: PROMPT_OPTIONS.lightQuality },
      { key: "fillLevel", label: "Fill", options: PROMPT_OPTIONS.fillLevel },
      { key: "separationLight", label: "Separation", options: PROMPT_OPTIONS.separationLight },
    ],
  },
  outfit: {
    title: "Outfit",
    description: "Garment construction, materials and styling state.",
    fields: [
      { key: "wardrobeCategory", label: "Category", options: PROMPT_OPTIONS.wardrobeCategory },
      { key: "mainGarment", label: "Main garment", options: PROMPT_OPTIONS.mainGarment },
      { key: "silhouette", label: "Silhouette", options: PROMPT_OPTIONS.silhouette },
      { key: "material", label: "Material", options: PROMPT_OPTIONS.material },
      { key: "stylingState", label: "Styling state", options: PROMPT_OPTIONS.stylingState },
      { key: "footwear", label: "Footwear", options: PROMPT_OPTIONS.footwear },
      { key: "accessories", label: "Accessories", options: PROMPT_OPTIONS.accessories },
    ],
  },
  location: {
    title: "Location",
    description: "Environment, surface, atmosphere and props.",
    fields: [
      { key: "locationCategory", label: "Location", options: PROMPT_OPTIONS.locationCategory },
      { key: "surface", label: "Surface", options: PROMPT_OPTIONS.surface },
      { key: "timeOfDay", label: "Time", options: PROMPT_OPTIONS.timeOfDay },
      { key: "weather", label: "Weather", options: PROMPT_OPTIONS.weather },
      { key: "environmentalDepth", label: "Environment visibility", options: PROMPT_OPTIONS.environmentalDepth },
      { key: "props", label: "Props", options: PROMPT_OPTIONS.props },
    ],
  },
  finish: {
    title: "Finish",
    description: "Hair, makeup, colour and restrained retouching.",
    fields: [
      { key: "makeup", label: "Makeup", options: PROMPT_OPTIONS.makeup },
      { key: "hair", label: "Hair", options: PROMPT_OPTIONS.hair },
      { key: "realism", label: "Realism", options: PROMPT_OPTIONS.realism },
      { key: "colourGrade", label: "Colour", options: PROMPT_OPTIONS.colourGrade },
      { key: "retouching", label: "Retouching", options: PROMPT_OPTIONS.retouching },
      { key: "grain", label: "Texture", options: PROMPT_OPTIONS.grain },
      { key: "aspectRatio", label: "Aspect ratio", options: PROMPT_OPTIONS.aspectRatio },
    ],
  },
};

const MOOD_CHOICES = [
  "quiet luxury editorial",
  "cinematic",
  "natural",
  "bold",
  "minimal",
  "sensual editorial",
  "documentary",
  "direct-flash",
];

const PROJECT_LABELS: Record<PromptConfig["projectType"], string> = {
  portrait: "Portrait",
  "beauty editorial": "Beauty",
  "fashion editorial": "Fashion editorial",
  "lifestyle portrait": "Lifestyle",
  "product photography": "Product with model",
  "cinematic scene": "Cinematic scene",
};

const FIDELITY_CHOICES: Array<{
  value: PromptConfig["mode"];
  title: string;
  description: string;
}> = [
  {
    value: "close reconstruction",
    title: "Exact shot structure",
    description: "Keep pose, styling, camera, lighting and location closely aligned.",
  },
  {
    value: "technical breakdown",
    title: "Creative adaptation",
    description: "Keep the concept but allow controlled photographic changes.",
  },
  {
    value: "inspired",
    title: "Loose inspiration",
    description: "Use the mood and styling language rather than the exact shot.",
  },
];

const SPEED_CHOICES: Array<{
  value: PromptConfig["aiSpeed"];
  title: string;
  description: string;
  model: string;
  badge: string;
}> = [
  {
    value: "fast",
    title: "Fast",
    description: "Best for quick prompt building and larger Reel or carousel sets.",
    model: "GPT-5 nano",
    badge: "Recommended",
  },
  {
    value: "balanced",
    title: "Balanced",
    description: "More detailed visual reasoning with a moderate wait.",
    model: "GPT-5 mini",
    badge: "More detail",
  },
  {
    value: "quality",
    title: "Best detail",
    description: "Use for difficult lighting, anatomy or complex multi-reference shoots.",
    model: "GPT-5",
    badge: "Slowest",
  },
];

const DEFAULT_URL_SELECTIONS: Record<UrlSectionKey, boolean> = {
  media: true,
  summary: true,
  camera: true,
  pose: true,
  carousel: true,
  reel: true,
  elements: true,
  adaptations: true,
};

function isPortraitProject(projectType: PromptConfig["projectType"]) {
  return ["portrait", "beauty editorial", "fashion editorial", "lifestyle portrait"].includes(projectType);
}

function downloadText(filename: string, contents: string, mime = "text/plain") {
  const blob = new Blob([contents], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function readApiResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    if (response.status === 413) throw new Error("The reference pack is too large. Remove an image and retry.");
    throw new Error(text.trim() || `The server returned an unreadable response (${response.status}).`);
  }
}

function fileSlug(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "promptlens-shoot";
}

function classNames(...items: Array<string | false | null | undefined>) {
  return items.filter(Boolean).join(" ");
}

function decodeDisplayText(value: string) {
  if (!value) return "";
  const named: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " };
  let decoded = value;
  for (let pass = 0; pass < 3; pass += 1) {
    const next = decoded
      .replace(/&#x([0-9a-f]+);?/gi, (entity, code: string) => {
        const point = Number.parseInt(code, 16);
        try { return Number.isFinite(point) ? String.fromCodePoint(point) : entity; } catch { return entity; }
      })
      .replace(/&#([0-9]+);?/g, (entity, code: string) => {
        const point = Number.parseInt(code, 10);
        try { return Number.isFinite(point) ? String.fromCodePoint(point) : entity; } catch { return entity; }
      })
      .replace(/&([a-z]+);/gi, (entity, name: string) => named[name.toLowerCase()] ?? entity);
    if (next === decoded) break;
    decoded = next;
  }
  return decoded.replace(/\s+/g, " ").trim();
}

export default function PromptLensV25() {
  const [screen, setScreen] = useState<Screen>("source");
  const [references, setReferences] = useState<ReferenceImage[]>([]);
  const [config, setConfig] = useState<PromptConfig>(DEFAULT_CONFIG);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [status, setStatus] = useState<Status>("checking");
  const [sourceMode, setSourceMode] = useState<SourceMode>(null);
  const [manualDescription, setManualDescription] = useState("");
  const [urlModalOpen, setUrlModalOpen] = useState(false);
  const [urlValue, setUrlValue] = useState("");
  const [urlImport, setUrlImport] = useState<UrlImportResult | null>(null);
  const [urlSelections, setUrlSelections] = useState(DEFAULT_URL_SELECTIONS);
  const [selectedMedia, setSelectedMedia] = useState<number[]>([]);
  const [primaryMediaIndex, setPrimaryMediaIndex] = useState(0);
  const [urlLoading, setUrlLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [identityUploading, setIdentityUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resultTab, setResultTab] = useState<ResultTab>("prompt");
  const [fineTuneOpen, setFineTuneOpen] = useState(false);
  const [drawerGroup, setDrawerGroup] = useState<DrawerGroupKey>("pose");
  const [exportOpen, setExportOpen] = useState(false);
  const [copied, setCopied] = useState("");
  const [saveState, setSaveState] = useState<"saved" | "saving" | "unsaved">("saved");
  const [savedShoots, setSavedShoots] = useState<SavedShoot[]>([]);
  const [subjectProfiles, setSubjectProfiles] = useState<Record<string, SubjectPhysicalProfile>>({});
  const [outputs, setOutputs] = useState<Record<OutputChoice, boolean>>({
    image: true,
    carousel: false,
    reel: false,
    video: false,
  });
  const [drafts, setDrafts] = useState({ prompt: "", short: "", negative: "" });

  useEffect(() => {
    const storedConfig = localStorage.getItem(CONFIG_KEY);
    if (storedConfig) {
      try {
        const parsed = JSON.parse(storedConfig) as Partial<PromptConfig>;
        setConfig({
          ...DEFAULT_CONFIG,
          ...parsed,
          subjectProfile: { ...DEFAULT_CONFIG.subjectProfile, ...(parsed.subjectProfile ?? {}) },
        });
      } catch {
        localStorage.removeItem(CONFIG_KEY);
      }
    }

    const storedShoots = localStorage.getItem(SHOOTS_KEY);
    if (storedShoots) {
      try { setSavedShoots(JSON.parse(storedShoots) as SavedShoot[]); }
      catch { localStorage.removeItem(SHOOTS_KEY); }
    }

    const storedProfiles = localStorage.getItem(PROFILE_KEY);
    if (storedProfiles) {
      try { setSubjectProfiles(JSON.parse(storedProfiles) as Record<string, SubjectPhysicalProfile>); }
      catch { localStorage.removeItem(PROFILE_KEY); }
    }

    fetch("/api/health")
      .then((response) => response.json())
      .then((data: { openAIConfigured?: boolean }) => setStatus(data.openAIConfigured ? "connected" : "missing"))
      .catch(() => setStatus("offline"));
  }, []);

  useEffect(() => {
    setSaveState("saving");
    const timer = window.setTimeout(() => {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
      setSaveState("saved");
    }, 450);
    return () => window.clearTimeout(timer);
  }, [config]);

  useEffect(() => {
    localStorage.setItem(SHOOTS_KEY, JSON.stringify(savedShoots));
  }, [savedShoots]);

  useEffect(() => {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(subjectProfiles));
  }, [subjectProfiles]);

  const promptOutput = useMemo(() => buildPromptOutput(config, analysis), [config, analysis]);
  const combinedBytes = useMemo(() => totalReferenceBytes(references), [references]);
  const identityReference = references.find((reference) => reference.role === "identity") ?? null;
  const sourceReferences = references.filter((reference) => reference.role !== "identity");
  const sourceReady = sourceReferences.length > 0 || Boolean(urlImport) || manualDescription.trim().length > 0;
  const completedStep = screen === "source" ? 0 : screen === "identity" ? 1 : screen === "direction" ? 2 : screen === "processing" ? 3 : 4;

  useEffect(() => {
    setDrafts({
      prompt: promptOutput.fullPrompt,
      short: promptOutput.compactPrompt,
      negative: promptOutput.negativePrompt,
    });
  }, [promptOutput.fullPrompt, promptOutput.compactPrompt, promptOutput.negativePrompt]);

  function updateConfig<K extends keyof PromptConfig>(key: K, value: PromptConfig[K]) {
    setConfig((current) => ({ ...current, [key]: value }));
  }

  function updateProfile<K extends keyof SubjectPhysicalProfile>(key: K, value: SubjectPhysicalProfile[K]) {
    setConfig((current) => ({
      ...current,
      subjectProfile: { ...current.subjectProfile, [key]: value },
    }));
  }

  async function importReferenceUrl() {
    const value = urlValue.trim();
    if (!value) {
      setError("Paste a public URL first.");
      return;
    }
    setUrlLoading(true);
    setError("");
    try {
      const response = await fetch("/api/import-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: value }),
      });
      const payload = (await readApiResponse(response)) as UrlImportResult & { error?: string };
      if (!response.ok || !payload.ideas) throw new Error(payload.error || "The URL could not be imported.");
      setUrlImport(payload);
      setUrlSelections(DEFAULT_URL_SELECTIONS);
      setSelectedMedia(payload.media.map((_, index) => index));
      setPrimaryMediaIndex(0);
      if (payload.title && config.shootName === DEFAULT_CONFIG.shootName) {
        updateConfig("shootName", payload.title.slice(0, 90));
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The URL could not be imported.");
    } finally {
      setUrlLoading(false);
    }
  }

  function applyUrlImport() {
    if (!urlImport) return;
    const currentIdentity = references.filter((reference) => reference.role === "identity");
    const isReelImport = Boolean(urlImport.videoFrameCount) || /reel|video/i.test(urlImport.contentType);
    const orderedMediaIndexes = isReelImport
      ? [primaryMediaIndex, ...selectedMedia.filter((index) => index !== primaryMediaIndex)]
      : selectedMedia;
    const imported = urlSelections.media
      ? orderedMediaIndexes
          .filter((index, position, values) => selectedMedia.includes(index) && values.indexOf(index) === position)
          .slice(0, MAX_SOURCE_REFERENCES)
          .map((mediaIndex) => ({ item: urlImport.media[mediaIndex], mediaIndex }))
          .filter((entry) => Boolean(entry.item))
          .map(({ item, mediaIndex }, index): ReferenceImage => {
            const isPrimaryReelFrame = isReelImport && mediaIndex === primaryMediaIndex;
            return {
              id: crypto.randomUUID(),
              name: isPrimaryReelFrame
                ? `PRIMARY REEL SHOT — ${item.name || `frame-${index + 1}`}`
                : isReelImport
                  ? `REEL CONTINUITY ONLY — ${item.name || `frame-${index + 1}`}`
                  : item.name || `url-reference-${index + 1}`,
              dataUrl: item.dataUrl,
              role: isReelImport && !isPrimaryReelFrame ? "general" : "shot",
              compressedBytes: Math.ceil((item.dataUrl.length * 3) / 4),
            };
          })
      : [];
    const next = [...currentIdentity, ...imported].slice(0, MAX_REFERENCES);
    if (totalReferenceBytes(next) > MAX_TOTAL_BYTES) {
      setError("The selected preview images are too large. Select fewer previews or upload screenshots instead.");
      return;
    }
    setReferences(next);
    setSourceMode("url");
    setUrlModalOpen(false);
    setError("");
  }

  async function addSourceReferences(fileList: FileList | null) {
    if (!fileList?.length) return;
    setUploading(true);
    setError("");
    try {
      const chosen = Array.from(fileList).slice(0, MAX_SOURCE_REFERENCES);
      const compressed = await Promise.all(chosen.map((file) => compressReference(file, "shot")));
      const identity = references.filter((reference) => reference.role === "identity");
      const next = [...identity, ...compressed].slice(0, MAX_REFERENCES);
      if (totalReferenceBytes(next) > MAX_TOTAL_BYTES) throw new Error("The compressed references exceed the project limit. Add fewer images.");
      setReferences(next);
      setSourceMode("upload");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The source images could not be prepared.");
    } finally {
      setUploading(false);
    }
  }

  async function addIdentityReference(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    setIdentityUploading(true);
    setError("");
    try {
      const identity = await compressReference(file, "identity");
      const next = [identity, ...sourceReferences].slice(0, MAX_REFERENCES);
      if (totalReferenceBytes(next) > MAX_TOTAL_BYTES) throw new Error("The identity image makes the reference pack too large.");
      setReferences(next);
      setConfig((current) => ({
        ...current,
        identityStrength: current.identityStrength === "none" ? "maximum" : current.identityStrength,
        preserveHair: true,
        faceDetailPriority: true,
      }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The identity image could not be prepared.");
    } finally {
      setIdentityUploading(false);
    }
  }

  function removeReference(id: string) {
    setReferences((current) => current.filter((reference) => reference.id !== id));
  }

  function buildSelectedUrlContext() {
    if (!urlImport) return undefined;
    const cameraCues = urlSelections.camera
      ? urlImport.ideas.carouselSlides.map((item) => item.cameraOrComposition).join("; ")
      : "";
    const poseCues = urlSelections.pose
      ? urlImport.ideas.carouselSlides.map((item) => item.poseOrAction).join("; ")
      : "";
    const selectedSummary = [
      urlSelections.summary ? urlImport.ideas.creativeSummary : "",
      cameraCues ? `Camera and composition cues: ${cameraCues}` : "",
      poseCues ? `Pose and action cues: ${poseCues}` : "",
    ].filter(Boolean).join("\n");

    return {
      sourceUrl: urlImport.sourceUrl,
      platform: urlImport.platform,
      contentType: urlImport.contentType,
      title: urlImport.title,
      description: urlSelections.summary ? urlImport.description : "",
      creativeSummary: selectedSummary,
      carouselPlan: urlSelections.carousel
        ? urlImport.ideas.carouselSlides.map((item) => `Slide ${item.slide}: ${item.purpose} — ${item.visualIdea}; ${item.cameraOrComposition}; ${item.poseOrAction}`).join("\n")
        : "",
      reelPlan: urlSelections.reel
        ? urlImport.ideas.reelBeats.map((item) => `Beat ${item.beat} (${item.timing}): ${item.visual}; ${item.action}; ${item.camera}; ${item.transition}`).join("\n")
        : "",
      reusableElements: urlSelections.elements ? urlImport.ideas.reusableElements : [],
      adaptationIdeas: urlSelections.adaptations ? urlImport.ideas.adaptationIdeas : [],
      primaryShotName: urlImport.media[primaryMediaIndex]?.name || "",
      reelFrameMode: (Boolean(urlImport.videoFrameCount) || /reel|video/i.test(urlImport.contentType))
        ? "single-primary-frame-with-continuity-support"
        : "standard-image-reference",
    };
  }

  async function analyseReferences() {
    if (!sourceReady) {
      setError("Choose a URL, upload a source image, or describe the shot first.");
      setScreen("source");
      return;
    }
    const hasIdentity = Boolean(identityReference);
    setLoading(true);
    setError("");
    setScreen("processing");
    try {
      const selectedUrlContext = buildSelectedUrlContext();
      const manualContext = manualDescription.trim()
        ? {
            sourceUrl: "",
            platform: "Manual description",
            contentType: "text brief",
            title: config.shootName,
            description: manualDescription.trim(),
            creativeSummary: manualDescription.trim(),
            carouselPlan: "",
            reelPlan: "",
            reusableElements: [],
            adaptationIdeas: [],
            primaryShotName: "",
            reelFrameMode: "manual-description",
          }
        : undefined;

      const response = await fetch("/api/analyse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          images: references.map((reference) => ({
            dataUrl: reference.dataUrl,
            role: reference.role,
            name: reference.name,
          })),
          sourceContext: selectedUrlContext ?? manualContext,
          options: {
            shootName: config.shootName,
            projectType: config.projectType,
            mode: config.mode,
            generator: config.generator,
            aiSpeed: config.aiSpeed,
            identityStrength: hasIdentity ? config.identityStrength : "none",
            preserveHair: hasIdentity ? config.preserveHair : false,
            preserveBodyProportions: hasIdentity ? config.preserveBodyProportions : false,
            preserveSourcePerspective: config.preserveSourcePerspective,
            faceDetailPriority: config.faceDetailPriority,
            subjectProfile: config.subjectProfile,
            notes: [
              config.notes,
              outputs.carousel ? "Create a carousel shot plan." : "",
              outputs.reel ? "Create a Reel shot plan." : "",
              outputs.video ? "Include video-generation direction." : "",
            ].filter(Boolean).join("\n"),
          },
        }),
      });
      const payload = (await readApiResponse(response)) as { analysis?: AnalysisResult; error?: string };
      if (!response.ok || !payload.analysis) throw new Error(payload.error || "The analysis did not return a usable result.");
      setAnalysis(payload.analysis);
      setConfig((current) => ({
        ...current,
        ...payload.analysis?.suggestedConfig,
        ...(!hasIdentity ? {
          identityStrength: "none" as const,
          preserveHair: false,
          preserveBodyProportions: false,
        } : {}),
      }));
      setScreen("result");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The analysis failed.");
      setScreen("direction");
    } finally {
      setLoading(false);
    }
  }

  function openManualResult() {
    setAnalysis(null);
    setScreen("result");
    setError("");
  }

  function saveShoot() {
    const name = config.shootName.trim() || "Untitled shoot";
    const existing = savedShoots.find((shoot) => shoot.name.toLowerCase() === name.toLowerCase());
    const item: SavedShoot = {
      id: existing?.id ?? crypto.randomUUID(),
      name,
      updatedAt: new Date().toISOString(),
      config: { ...config, shootName: name },
      analysis,
    };
    setSavedShoots((current) => [item, ...current.filter((shoot) => shoot.id !== item.id)]);
    setCopied("saved");
    window.setTimeout(() => setCopied(""), 1500);
  }

  function loadShoot(id: string) {
    const shoot = savedShoots.find((item) => item.id === id);
    if (!shoot) return;
    setConfig({
      ...DEFAULT_CONFIG,
      ...shoot.config,
      subjectProfile: { ...DEFAULT_CONFIG.subjectProfile, ...shoot.config.subjectProfile },
    });
    setAnalysis(shoot.analysis);
    setReferences([]);
    setScreen("result");
  }

  function resetProject() {
    setReferences([]);
    setConfig({ ...DEFAULT_CONFIG, subjectProfile: { ...DEFAULT_CONFIG.subjectProfile } });
    setAnalysis(null);
    setSourceMode(null);
    setManualDescription("");
    setUrlImport(null);
    setUrlValue("");
    setUrlSelections(DEFAULT_URL_SELECTIONS);
    setSelectedMedia([]);
    setPrimaryMediaIndex(0);
    setOutputs({ image: true, carousel: false, reel: false, video: false });
    setScreen("source");
    setError("");
    setResultTab("prompt");
  }

  async function copyText(label: string, text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    window.setTimeout(() => setCopied(""), 1500);
  }

  function selectAllUrl(value: boolean) {
    setUrlSelections(Object.fromEntries(Object.keys(DEFAULT_URL_SELECTIONS).map((key) => [key, value])) as Record<UrlSectionKey, boolean>);
    setSelectedMedia(value && urlImport ? urlImport.media.map((_, index) => index) : []);
    if (value && urlImport && !urlImport.media[primaryMediaIndex]) setPrimaryMediaIndex(0);
  }

  function toggleOutput(output: OutputChoice) {
    setOutputs((current) => ({ ...current, [output]: !current[output] }));
  }

  function saveProfile() {
    const name = config.subjectProfile.profileName.trim();
    if (!name) {
      setError("Give the physical profile a name before saving it.");
      return;
    }
    setSubjectProfiles((current) => ({
      ...current,
      [name]: { ...config.subjectProfile, enabled: true, profileName: name },
    }));
    setCopied("profile");
    window.setTimeout(() => setCopied(""), 1500);
  }

  const topTitle = config.shootName.trim() || "Untitled shoot";

  return (
    <main className="v25-shell">
      <header className="v25-topbar">
        <button className="v25-brand" type="button" onClick={() => setScreen("source")}>
          <span className="v25-brand-mark">P</span>
          <span>
            <strong>PromptLens</strong>
            <small>V2.5.7</small>
          </span>
        </button>

        <label className="v25-shoot-title">
          <span className="sr-only">Shoot name</span>
          <input
            value={topTitle}
            onChange={(event) => updateConfig("shootName", event.target.value)}
            aria-label="Shoot name"
          />
        </label>

        <div className="v25-top-actions">
          <StatusPill status={status} />
          <span className="v25-save-state">{saveState === "saving" ? "Saving…" : "Saved"}</span>
          {savedShoots.length ? (
            <select className="v25-library-select" defaultValue="" onChange={(event) => {
              if (event.target.value) loadShoot(event.target.value);
              event.currentTarget.value = "";
            }} aria-label="Open a saved shoot">
              <option value="">Your shoots</option>
              {savedShoots.map((shoot) => <option value={shoot.id} key={shoot.id}>{shoot.name}</option>)}
            </select>
          ) : null}
          <button className="v25-button ghost compact" type="button" onClick={resetProject}>New shoot</button>
        </div>
      </header>

      <div className="v25-app-grid">
        <ProgressRail screen={screen} completedStep={completedStep} onNavigate={setScreen} />

        <section className="v25-workspace">
          {error ? <div className="v25-alert error"><span>!</span><p>{error}</p><button type="button" onClick={() => setError("")}>Dismiss</button></div> : null}
          {status === "missing" ? <div className="v25-alert warning"><span>i</span><p>OpenAI is not connected. Add <code>OPENAI_API_KEY</code> in Vercel to analyse references.</p></div> : null}

          {screen === "source" ? (
            <SourceScreen
              sourceMode={sourceMode}
              sourceReferences={sourceReferences}
              manualDescription={manualDescription}
              uploading={uploading}
              combinedBytes={combinedBytes}
              onUrl={() => { setSourceMode("url"); setUrlModalOpen(true); }}
              onFiles={addSourceReferences}
              onManual={() => setSourceMode("manual")}
              onManualChange={setManualDescription}
              onRemove={removeReference}
              onContinue={() => {
                if (!sourceReady) { setError("Choose a URL, upload a source image, or describe the shot first."); return; }
                setScreen("identity");
              }}
            />
          ) : null}

          {screen === "identity" ? (
            <IdentityScreen
              identity={identityReference}
              uploading={identityUploading}
              config={config}
              onFile={addIdentityReference}
              onRemove={removeReference}
              onChange={updateConfig}
              onBack={() => setScreen("source")}
              onContinue={() => setScreen("direction")}
            />
          ) : null}

          {screen === "direction" ? (
            <DirectionScreen
              config={config}
              outputs={outputs}
              status={status}
              loading={loading}
              onChange={updateConfig}
              onToggleOutput={toggleOutput}
              onBack={() => setScreen("identity")}
              onBuild={analyseReferences}
              onManual={openManualResult}
            />
          ) : null}

          {screen === "processing" ? <ProcessingScreen count={references.length} speed={config.aiSpeed} /> : null}

          {screen === "result" ? (
            <ResultScreen
              config={config}
              analysis={analysis}
              validations={promptOutput.validations}
              output={promptOutput}
              tab={resultTab}
              drafts={drafts}
              urlImport={urlImport}
              outputs={outputs}
              copied={copied}
              onTab={setResultTab}
              onDraft={(key, value) => setDrafts((current) => ({ ...current, [key]: value }))}
              onCopy={copyText}
              onFineTune={() => setFineTuneOpen(true)}
              onExport={() => setExportOpen(true)}
              onSave={saveShoot}
              onBack={() => setScreen("direction")}
            />
          ) : null}
        </section>
      </div>

      {urlModalOpen ? (
        <UrlImportModal
          value={urlValue}
          loading={urlLoading}
          result={urlImport}
          selections={urlSelections}
          selectedMedia={selectedMedia}
          primaryMediaIndex={primaryMediaIndex}
          onValue={setUrlValue}
          onAnalyse={importReferenceUrl}
          onClose={() => setUrlModalOpen(false)}
          onToggleSection={(key) => setUrlSelections((current) => ({ ...current, [key]: !current[key] }))}
          onToggleMedia={(index) => setSelectedMedia((current) => {
            if (index === primaryMediaIndex) return current;
            return current.includes(index) ? current.filter((item) => item !== index) : [...current, index];
          })}
          onPrimaryMedia={(index) => {
            setPrimaryMediaIndex(index);
            setSelectedMedia((current) => current.includes(index) ? current : [index, ...current]);
          }}
          onSelectAll={selectAllUrl}
          onApply={applyUrlImport}
          onMissingSlides={addSourceReferences}
        />
      ) : null}

      {fineTuneOpen ? (
        <FineTuneDrawer
          config={config}
          validations={promptOutput.validations}
          activeGroup={drawerGroup}
          profiles={subjectProfiles}
          copied={copied}
          onGroup={setDrawerGroup}
          onChange={updateConfig}
          onProfile={updateProfile}
          onLoadProfile={(name) => {
            const profile = subjectProfiles[name];
            if (profile) setConfig((current) => ({ ...current, subjectProfile: { ...profile, enabled: true } }));
          }}
          onSaveProfile={saveProfile}
          onClose={() => setFineTuneOpen(false)}
        />
      ) : null}

      {exportOpen ? (
        <ExportModal
          config={config}
          output={promptOutput}
          urlImport={urlImport}
          outputs={outputs}
          onClose={() => setExportOpen(false)}
        />
      ) : null}
    </main>
  );
}

function StatusPill({ status }: { status: Status }) {
  const labels: Record<Status, string> = {
    checking: "Checking",
    connected: "AI connected",
    missing: "API key needed",
    offline: "Offline",
  };
  return <span className={classNames("v25-status", status)}><i />{labels[status]}</span>;
}

function ProgressRail({
  screen,
  completedStep,
  onNavigate,
}: {
  screen: Screen;
  completedStep: number;
  onNavigate: (screen: Screen) => void;
}) {
  const items: Array<{ number: number; title: string; subtitle: string; screen: Screen }> = [
    { number: 1, title: "Shot", subtitle: "URL, images or description", screen: "source" },
    { number: 2, title: "Face", subtitle: "Optional identity reference", screen: "identity" },
    { number: 3, title: "Direction", subtitle: "Choose the creative goal", screen: "direction" },
    { number: 4, title: "Result", subtitle: "Copy or fine-tune", screen: "result" },
  ];
  const activeNumber = screen === "source" ? 1 : screen === "identity" ? 2 : screen === "direction" || screen === "processing" ? 3 : 4;
  return (
    <aside className="v25-progress" aria-label="Shoot progress">
      <p>Create a shoot</p>
      <div className="v25-progress-list">
        {items.map((item) => {
          const complete = completedStep >= item.number && activeNumber !== item.number;
          const enabled = item.number <= Math.max(completedStep + 1, activeNumber);
          return (
            <button
              type="button"
              key={item.number}
              className={classNames("v25-progress-item", activeNumber === item.number && "active", complete && "complete")}
              disabled={!enabled}
              onClick={() => onNavigate(item.screen)}
            >
              <span>{complete ? "✓" : item.number}</span>
              <div><strong>{item.title}</strong><small>{item.subtitle}</small></div>
            </button>
          );
        })}
      </div>
      <div className="v25-progress-help">
        <span>?</span>
        <div><strong>Need help?</strong><small>Each screen asks one question.</small></div>
      </div>
    </aside>
  );
}

function ScreenHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <header className="v25-screen-header">
      <span>{eyebrow}</span>
      <h1>{title}</h1>
      <p>{description}</p>
    </header>
  );
}

function SourceScreen({
  sourceMode,
  sourceReferences,
  manualDescription,
  uploading,
  combinedBytes,
  onUrl,
  onFiles,
  onManual,
  onManualChange,
  onRemove,
  onContinue,
}: {
  sourceMode: SourceMode;
  sourceReferences: ReferenceImage[];
  manualDescription: string;
  uploading: boolean;
  combinedBytes: number;
  onUrl: () => void;
  onFiles: (files: FileList | null) => void;
  onManual: () => void;
  onManualChange: (value: string) => void;
  onRemove: (id: string) => void;
  onContinue: () => void;
}) {
  const ready = sourceReferences.length > 0 || sourceMode === "url" || manualDescription.trim().length > 0;
  return (
    <div className="v25-screen">
      <ScreenHeader
        eyebrow="STEP 1 OF 4"
        title="Choose the shot you want to create"
        description="Start from a public URL, upload the exact source images, or describe the shoot in your own words."
      />

      <div className="v25-source-grid">
        <button className={classNames("v25-source-card", sourceMode === "url" && "selected")} type="button" onClick={onUrl}>
          <span className="v25-card-icon violet">↗</span>
          <div><strong>Use a URL</strong><p>Import a public post, carousel, Reel, webpage or image.</p></div>
          <b>Open importer</b>
        </button>

        <label className={classNames("v25-source-card", sourceMode === "upload" && "selected")}>
          <input type="file" multiple accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={(event) => { void onFiles(event.target.files); event.currentTarget.value = ""; }} />
          <span className="v25-card-icon blue">＋</span>
          <div><strong>{uploading ? "Preparing images…" : "Upload the shot"}</strong><p>Use one or more images as the visual target.</p></div>
          <b>Choose images</b>
        </label>
      </div>

      <button className={classNames("v25-manual-trigger", sourceMode === "manual" && "selected")} type="button" onClick={onManual}>
        <span>✎</span><div><strong>Start without a visual reference</strong><small>Describe the pose, outfit, lighting and location manually.</small></div><b>{sourceMode === "manual" ? "Open" : "Write a description"}</b>
      </button>

      {sourceMode === "manual" ? (
        <section className="v25-soft-panel">
          <label className="v25-field">
            <span>Describe the shot</span>
            <textarea value={manualDescription} onChange={(event) => onManualChange(event.target.value)} placeholder="Example: a full-body fashion portrait in a concrete studio, black tailored suit, soft side light, natural relaxed stance, 85mm perspective…" />
          </label>
        </section>
      ) : null}

      {sourceReferences.length ? (
        <section className="v25-section-block">
          <div className="v25-section-heading"><div><span>YOUR SOURCE</span><h2>{sourceReferences.length} shot reference{sourceReferences.length === 1 ? "" : "s"}</h2></div><small>{formatBytes(combinedBytes)} prepared</small></div>
          <div className="v25-thumb-grid">
            {sourceReferences.map((reference, index) => (
              <article className="v25-thumb-card" key={reference.id}>
                <div className="v25-thumb-image"><Image src={reference.dataUrl} alt={reference.name} fill sizes="160px" unoptimized /><span>{index === 0 ? "Primary" : index + 1}</span></div>
                <div><strong>{reference.name}</strong><small>{formatBytes(reference.compressedBytes)}</small></div>
                <button type="button" aria-label={`Remove ${reference.name}`} onClick={() => onRemove(reference.id)}>×</button>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <div className="v25-sticky-actions">
        <div><strong>{ready ? "Source ready" : "Choose one way to begin"}</strong><small>Your source controls pose, outfit, camera, lighting and location.</small></div>
        <button className="v25-button primary" type="button" disabled={!ready} onClick={onContinue}>Continue to face <span>→</span></button>
      </div>
    </div>
  );
}

function IdentityScreen({
  identity,
  uploading,
  config,
  onFile,
  onRemove,
  onChange,
  onBack,
  onContinue,
}: {
  identity: ReferenceImage | null;
  uploading: boolean;
  config: PromptConfig;
  onFile: (files: FileList | null) => void;
  onRemove: (id: string) => void;
  onChange: <K extends keyof PromptConfig>(key: K, value: PromptConfig[K]) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  return (
    <div className="v25-screen narrow">
      <ScreenHeader
        eyebrow="STEP 2 OF 4"
        title="Who should appear in the final image?"
        description="The facial reference controls identity only. The shot source continues to control everything photographic."
      />

      <section className="v25-identity-card">
        {identity ? (
          <div className="v25-identity-loaded">
            <div className="v25-identity-image"><Image src={identity.dataUrl} alt="Facial identity reference" fill sizes="240px" unoptimized /></div>
            <div className="v25-identity-details">
              <span className="v25-success-chip">✓ Identity reference added</span>
              <h2>{identity.name}</h2>
              <p>PromptLens will use this face as the sole recognisable identity source.</p>
              <div className="v25-quality-row"><span><i />Face visible</span><span><i />Identity isolated</span><span><i />High-detail analysis</span></div>
              <div className="v25-inline-actions">
                <label className="v25-button secondary compact"><input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={(event) => { void onFile(event.target.files); event.currentTarget.value = ""; }} />Replace face</label>
                <button className="v25-button ghost compact" type="button" onClick={() => onRemove(identity.id)}>Remove</button>
              </div>
            </div>
          </div>
        ) : (
          <label className="v25-identity-drop">
            <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={(event) => { void onFile(event.target.files); event.currentTarget.value = ""; }} />
            <span className="v25-card-icon violet">☺</span>
            <strong>{uploading ? "Preparing facial reference…" : "Upload facial identity"}</strong>
            <p>Use a clear front-facing or three-quarter portrait with visible facial detail.</p>
            <b>Choose portrait</b>
          </label>
        )}
      </section>

      {identity ? (
        <section className="v25-soft-panel">
          <h2>How closely should the face match?</h2>
          <div className="v25-choice-stack">
            {[
              { value: "maximum", title: "Maximum match", description: "Preserve facial geometry and identifying details closely." },
              { value: "standard", title: "Natural match", description: "Preserve identity while allowing normal editorial variation." },
              { value: "none", title: "Do not use identity", description: "Create a new anonymous adult subject instead." },
            ].map((item) => (
              <button className={classNames("v25-choice-row", config.identityStrength === item.value && "selected")} type="button" key={item.value} onClick={() => onChange("identityStrength", item.value as PromptConfig["identityStrength"])}>
                <span>{config.identityStrength === item.value ? "●" : "○"}</span><div><strong>{item.title}</strong><small>{item.description}</small></div>
              </button>
            ))}
          </div>
          <label className="v25-toggle-row"><input type="checkbox" checked={config.preserveHair} onChange={(event) => onChange("preserveHair", event.target.checked)} /><span><strong>Keep the identity hairstyle</strong><small>Use the source-shot hairstyle when this is off.</small></span></label>
        </section>
      ) : (
        <div className="v25-note-card"><span>i</span><div><strong>Identity is optional</strong><p>You can continue without a face. The prompt will describe a new anonymous adult subject and will not make identity-preservation claims.</p></div></div>
      )}

      <div className="v25-sticky-actions split">
        <button className="v25-button ghost" type="button" onClick={onBack}>← Back</button>
        <div><button className="v25-button primary" type="button" onClick={onContinue}>{identity ? "Continue to direction" : "Continue without identity"} <span>→</span></button></div>
      </div>
    </div>
  );
}

function DirectionScreen({
  config,
  outputs,
  status,
  loading,
  onChange,
  onToggleOutput,
  onBack,
  onBuild,
  onManual,
}: {
  config: PromptConfig;
  outputs: Record<OutputChoice, boolean>;
  status: Status;
  loading: boolean;
  onChange: <K extends keyof PromptConfig>(key: K, value: PromptConfig[K]) => void;
  onToggleOutput: (output: OutputChoice) => void;
  onBack: () => void;
  onBuild: () => void;
  onManual: () => void;
}) {
  return (
    <div className="v25-screen">
      <ScreenHeader eyebrow="STEP 3 OF 4" title="What are you creating?" description="Choose the main creative direction. PromptLens will handle the detailed photography logic underneath." />

      <section className="v25-section-block">
        <div className="v25-section-heading"><div><span>SHOOT TYPE</span><h2>Choose the primary format</h2></div></div>
        <div className="v25-type-grid">
          {PROJECT_TYPES.map((type) => (
            <button className={classNames("v25-type-card", config.projectType === type && "selected")} type="button" key={type} onClick={() => onChange("projectType", type)}>
              <span>{type === "portrait" ? "◉" : type === "beauty editorial" ? "✦" : type === "fashion editorial" ? "◆" : type === "lifestyle portrait" ? "☼" : type === "product photography" ? "□" : "▶"}</span>
              <strong>{PROJECT_LABELS[type]}</strong>
            </button>
          ))}
        </div>
      </section>

      <section className="v25-section-block">
        <div className="v25-section-heading"><div><span>OUTPUTS</span><h2>What should PromptLens create?</h2></div><small>Select more than one</small></div>
        <div className="v25-output-grid">
          {[
            { key: "image" as const, title: "Image prompt", description: "A production-ready generation prompt." },
            { key: "carousel" as const, title: "Carousel plan", description: "A structured multi-image sequence." },
            { key: "reel" as const, title: "Reel plan", description: "Timed beats, actions and camera movement." },
            { key: "video" as const, title: "Video prompt", description: "Motion direction for a generated clip." },
          ].map((item) => (
            <button className={classNames("v25-output-card", outputs[item.key] && "selected")} type="button" key={item.key} onClick={() => onToggleOutput(item.key)}>
              <span>{outputs[item.key] ? "✓" : "+"}</span><div><strong>{item.title}</strong><small>{item.description}</small></div>
            </button>
          ))}
        </div>
      </section>

      <section className="v25-section-block">
        <div className="v25-section-heading"><div><span>AI PROCESSING</span><h2>Choose speed or detail</h2></div><small>Fast is recommended for most shoots</small></div>
        <div className="v25-speed-grid">
          {SPEED_CHOICES.map((item) => (
            <button className={classNames("v25-speed-card", config.aiSpeed === item.value && "selected")} type="button" key={item.value} onClick={() => onChange("aiSpeed", item.value)}>
              <span>{config.aiSpeed === item.value ? "✓" : item.value === "fast" ? "⚡" : item.value === "balanced" ? "◐" : "✦"}</span>
              <div><strong>{item.title}</strong><small>{item.description}</small></div>
              <footer><b>{item.model}</b><em>{item.badge}</em></footer>
            </button>
          ))}
        </div>
      </section>

      <section className="v25-two-column">
        <div className="v25-section-block">
          <div className="v25-section-heading"><div><span>MOOD</span><h2>Set the visual tone</h2></div></div>
          <div className="v25-chip-grid">
            {MOOD_CHOICES.map((mood) => <button className={classNames("v25-chip", config.mood === mood && "selected")} type="button" key={mood} onClick={() => onChange("mood", mood)}>{mood}</button>)}
          </div>
        </div>

        <div className="v25-section-block">
          <div className="v25-section-heading"><div><span>SOURCE FIDELITY</span><h2>How closely should it follow?</h2></div></div>
          <div className="v25-choice-stack compact">
            {FIDELITY_CHOICES.map((item) => <button className={classNames("v25-choice-row", config.mode === item.value && "selected")} type="button" key={item.value} onClick={() => onChange("mode", item.value)}><span>{config.mode === item.value ? "●" : "○"}</span><div><strong>{item.title}</strong><small>{item.description}</small></div></button>)}
          </div>
        </div>
      </section>

      <section className="v25-soft-panel">
        <label className="v25-field"><span>Anything else PromptLens should know?</span><textarea value={config.notes} onChange={(event) => onChange("notes", event.target.value)} placeholder="Example: premium editorial finish, natural confidence, preserve the source outfit precisely, avoid glamour retouching…" /></label>
        <details className="v25-disclosure">
          <summary><span><strong>Advanced shoot settings</strong><small>Generator, aspect ratio and identity defaults</small></span><b>＋</b></summary>
          <div className="v25-form-grid">
            <label className="v25-field"><span>Target generator</span><select value={config.generator} onChange={(event) => onChange("generator", event.target.value as PromptConfig["generator"])}>{GENERATORS.map((generator) => <option value={generator} key={generator}>{generator}</option>)}</select></label>
            <label className="v25-field"><span>Aspect ratio</span><select value={config.aspectRatio} onChange={(event) => onChange("aspectRatio", event.target.value)}>{PROMPT_OPTIONS.aspectRatio.map((ratio) => <option value={ratio} key={ratio}>{ratio}</option>)}</select></label>
            <label className="v25-toggle-row"><input type="checkbox" checked={config.faceDetailPriority} onChange={(event) => onChange("faceDetailPriority", event.target.checked)} /><span><strong>Maximum facial detail</strong><small>Keep the face as the highest-resolution area.</small></span></label>
            <label className="v25-toggle-row"><input type="checkbox" checked={config.preserveBodyProportions} onChange={(event) => onChange("preserveBodyProportions", event.target.checked)} /><span><strong>Preserve body proportions</strong><small>Use the confirmed physical profile where visible.</small></span></label>
            <label className="v25-toggle-row"><input type="checkbox" checked={config.preserveSourcePerspective} onChange={(event) => onChange("preserveSourcePerspective", event.target.checked)} /><span><strong>Exact perspective lock</strong><small>Keep the original camera side, distance, lens perspective, horizon, crop and subject scale. Do not blend several frames into a new angle.</small></span></label>
          </div>
        </details>
      </section>

      <div className="v25-sticky-actions split">
        <button className="v25-button ghost" type="button" onClick={onBack}>← Back</button>
        <div className="v25-action-group">
          <button className="v25-button secondary" type="button" onClick={onManual}>Open editor without AI</button>
          <button className="v25-button primary" type="button" disabled={loading || status !== "connected"} onClick={onBuild}>{loading ? "Building…" : "Build my prompt"} <span>→</span></button>
        </div>
      </div>
    </div>
  );
}

function ProcessingScreen({ count, speed }: { count: number; speed: PromptConfig["aiSpeed"] }) {
  const speedLabel = speed === "fast" ? "Fast · GPT-5 nano" : speed === "balanced" ? "Balanced · GPT-5 mini" : "Best detail · GPT-5";
  return (
    <div className="v25-processing">
      <div className="v25-orbit"><span /><i /><b /></div>
      <span>BUILDING YOUR SHOOT · {speedLabel}</span>
      <h1>PromptLens is doing the technical work</h1>
      <p>Separating identity from styling, checking portrait realism, and translating the source into an editable prompt.</p>
      <div className="v25-processing-list">
        <div className="done"><span>✓</span><strong>Reading {count || "the"} reference{count === 1 ? "" : "s"}</strong></div>
        <div className="done"><span>✓</span><strong>Separating identity from the source person</strong></div>
        <div className="active"><span>●</span><strong>Checking pose, camera and lighting realism</strong></div>
        <div><span>○</span><strong>Building the final prompt</strong></div>
      </div>
    </div>
  );
}

function ResultScreen({
  config,
  analysis,
  validations,
  output,
  tab,
  drafts,
  urlImport,
  outputs,
  copied,
  onTab,
  onDraft,
  onCopy,
  onFineTune,
  onExport,
  onSave,
  onBack,
}: {
  config: PromptConfig;
  analysis: AnalysisResult | null;
  validations: PortraitValidation[];
  output: ReturnType<typeof buildPromptOutput>;
  tab: ResultTab;
  drafts: { prompt: string; short: string; negative: string };
  urlImport: UrlImportResult | null;
  outputs: Record<OutputChoice, boolean>;
  copied: string;
  onTab: (tab: ResultTab) => void;
  onDraft: (key: "prompt" | "short" | "negative", value: string) => void;
  onCopy: (label: string, value: string) => void;
  onFineTune: () => void;
  onExport: () => void;
  onSave: () => void;
  onBack: () => void;
}) {
  const warnings = validations.filter((item) => item.severity !== "info");
  const currentText = tab === "short" ? drafts.short : tab === "negative" ? drafts.negative : drafts.prompt;
  const currentKey = tab === "short" ? "short" : tab === "negative" ? "negative" : "prompt";
  return (
    <div className="v25-screen result-screen">
      <section className="v25-result-hero">
        <div><span className="v25-success-chip">✓ PROMPT READY</span><h1>Your shoot is ready to generate</h1><p>Built with separated identity, source-shot design and portrait-realism checks.</p></div>
        <div className="v25-result-actions"><button className="v25-button secondary" type="button" onClick={onFineTune}>Fine-tune</button><button className="v25-button primary" type="button" onClick={() => onCopy("main", drafts.prompt)}>{copied === "main" ? "Copied ✓" : "Copy prompt"}</button></div>
      </section>

      <section className="v25-result-summary">
        <div><span>PROJECT</span><strong>{PROJECT_LABELS[config.projectType]} · {config.aiSpeed === "fast" ? "Fast" : config.aiSpeed === "balanced" ? "Balanced" : "Best detail"}</strong></div>
        <div><span>IDENTITY</span><strong>{config.identityStrength === "none" ? "Anonymous subject" : `${config.identityStrength} match`}</strong></div>
        <div><span>REFERENCE</span><strong>{config.mode === "close reconstruction" ? "Exact structure" : config.mode}</strong></div>
        <div><span>REALISM</span><strong>{warnings.length ? `${warnings.length} suggestion${warnings.length === 1 ? "" : "s"}` : "Looks realistic"}</strong></div>
      </section>

      <div className="v25-result-grid">
        <section className="v25-prompt-panel">
          <nav className="v25-tabs" aria-label="Prompt output">
            {[
              ["prompt", "Final Prompt"],
              ["short", "Short Prompt"],
              ["negative", "Negative Prompt"],
              ["shot", "Shot Plan"],
              ["advanced", "Advanced"],
            ].map(([value, label]) => <button type="button" className={tab === value ? "active" : ""} key={value} onClick={() => onTab(value as ResultTab)}>{label}</button>)}
          </nav>

          {tab === "prompt" || tab === "short" || tab === "negative" ? (
            <div className="v25-prompt-editor">
              <div className="v25-codebar"><span>{tab === "prompt" ? "generation-prompt.txt" : tab === "short" ? "short-prompt.txt" : "negative-prompt.txt"}</span><button type="button" onClick={() => onCopy(tab, currentText)}>{copied === tab ? "Copied ✓" : "Copy"}</button></div>
              <textarea value={currentText} onChange={(event) => onDraft(currentKey, event.target.value)} />
            </div>
          ) : null}

          {tab === "shot" ? <ShotPlan urlImport={urlImport} analysis={analysis} outputs={outputs} /> : null}
          {tab === "advanced" ? <AdvancedResult output={output} analysis={analysis} /> : null}
        </section>

        <aside className="v25-result-sidebar">
          <section className="v25-side-card">
            <div className="v25-side-heading"><span className="v25-card-icon green">✓</span><div><strong>Source separation</strong><small>Identity and styling are isolated</small></div></div>
            <ul className="v25-check-list"><li>Face comes only from the identity reference</li><li>Source person remains anonymous</li><li>Pose, outfit and camera stay transferable</li></ul>
          </section>
          <section className="v25-side-card">
            <div className="v25-side-heading"><span className={classNames("v25-card-icon", warnings.length ? "amber" : "green")}>{warnings.length ? "!" : "✓"}</span><div><strong>Portrait realism</strong><small>{warnings.length ? "Review suggested improvements" : "No major conflicts detected"}</small></div></div>
            {warnings.slice(0, 3).map((item) => <div className="v25-mini-warning" key={item.id}><strong>{item.category}</strong><p>{item.message}</p></div>)}
            <button className="v25-text-button" type="button" onClick={onFineTune}>{warnings.length ? "Review suggestions" : "Open fine-tune controls"} →</button>
          </section>
          <section className="v25-side-card actions"><button className="v25-button secondary" type="button" onClick={onSave}>{copied === "saved" ? "Saved ✓" : "Save as shoot"}</button><button className="v25-button ghost" type="button" onClick={onExport}>Export files</button><button className="v25-text-button" type="button" onClick={onBack}>← Change direction</button></section>
        </aside>
      </div>
    </div>
  );
}

function ShotPlan({ urlImport, analysis, outputs }: { urlImport: UrlImportResult | null; analysis: AnalysisResult | null; outputs: Record<OutputChoice, boolean> }) {
  if (urlImport && (outputs.carousel || outputs.reel)) {
    return (
      <div className="v25-shot-plan">
        {outputs.carousel ? <section><div className="v25-plan-heading"><div><span>CAROUSEL</span><h2>{urlImport.ideas.carouselSlides.length} slide plan</h2></div></div><div className="v25-plan-grid">{urlImport.ideas.carouselSlides.map((item) => <article key={item.slide}><span>SLIDE {item.slide}</span><h3>{item.purpose}</h3><p>{item.visualIdea}</p><dl><dt>Camera</dt><dd>{item.cameraOrComposition}</dd><dt>Action</dt><dd>{item.poseOrAction}</dd></dl></article>)}</div></section> : null}
        {outputs.reel ? <section><div className="v25-plan-heading"><div><span>REEL</span><h2>{urlImport.ideas.reelBeats.length} beat timeline</h2></div></div><div className="v25-timeline">{urlImport.ideas.reelBeats.map((item) => <article key={item.beat}><span>{item.timing}</span><div><h3>{item.visual}</h3><p>{item.action}</p><small>{item.camera} · {item.transition}</small></div></article>)}</div></section> : null}
      </div>
    );
  }
  if (analysis?.shots.length) {
    return <div className="v25-plan-grid">{analysis.shots.map((shot) => <article key={shot.index}><span>SHOT {shot.index}</span><h3>{shot.pose}</h3><p>{shot.wardrobe}</p><dl><dt>Camera</dt><dd>{shot.camera}</dd><dt>Lighting</dt><dd>{shot.lighting}</dd><dt>Environment</dt><dd>{shot.environment}</dd></dl></article>)}</div>;
  }
  return <div className="v25-empty-result"><span>□</span><h2>No shot plan yet</h2><p>Select Carousel or Reel in Shoot Direction, or import a URL containing a sequence.</p></div>;
}

function AdvancedResult({ output, analysis }: { output: ReturnType<typeof buildPromptOutput>; analysis: AnalysisResult | null }) {
  return (
    <div className="v25-advanced-result">
      {analysis ? <section><span>ANALYSIS SUMMARY</span><h2>{analysis.projectTitle}</h2><p>{analysis.detectedSummary}</p></section> : null}
      <section><span>STRUCTURED CONFIGURATION</span><pre>{output.codeView}</pre></section>
    </div>
  );
}

function UrlImportModal({
  value,
  loading,
  result,
  selections,
  selectedMedia,
  primaryMediaIndex,
  onValue,
  onAnalyse,
  onClose,
  onToggleSection,
  onToggleMedia,
  onPrimaryMedia,
  onSelectAll,
  onApply,
  onMissingSlides,
}: {
  value: string;
  loading: boolean;
  result: UrlImportResult | null;
  selections: Record<UrlSectionKey, boolean>;
  selectedMedia: number[];
  primaryMediaIndex: number;
  onValue: (value: string) => void;
  onAnalyse: () => void;
  onClose: () => void;
  onToggleSection: (key: UrlSectionKey) => void;
  onToggleMedia: (index: number) => void;
  onPrimaryMedia: (index: number) => void;
  onSelectAll: (value: boolean) => void;
  onApply: () => void;
  onMissingSlides: (files: FileList | null) => void;
}) {
  const selectedCount = Object.values(selections).filter(Boolean).length;
  const isReelResult = Boolean(result?.videoFrameCount) || Boolean(result && /reel|video/i.test(result.contentType));
  return (
    <div className="v25-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="v25-modal url-modal" role="dialog" aria-modal="true" aria-labelledby="url-modal-title">
        <header className="v25-modal-header"><div><span>URL IMPORT</span><h2 id="url-modal-title">{result ? "Choose what to use" : "Import a visual reference"}</h2><p>{result ? "Everything is selected by default. Keep one section, several, or the complete source package." : "Paste a public URL and PromptLens will collect every accessible preview and creative cue."}</p></div><button type="button" onClick={onClose} aria-label="Close">×</button></header>

        {!result ? (
          <div className="v25-modal-body">
            <label className="v25-field large"><span>Public URL</span><div className="v25-url-input"><input type="url" value={value} onChange={(event) => onValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); onAnalyse(); } }} placeholder="https://www.instagram.com/p/..." /><button className="v25-button primary" type="button" disabled={loading || !value.trim()} onClick={onAnalyse}>{loading ? "Reading source…" : "Analyse URL"}</button></div><small>Public pages only. Private or login-protected media may expose only a cover image.</small></label>
            {loading ? <div className="v25-url-loading"><div className="v25-loading-bar"><span /></div><strong>Looking for public previews…</strong><p>Checking carousel images, visual structure and Reel pacing.</p></div> : null}
          </div>
        ) : (
          <>
            <div className="v25-url-summary-card"><div><span>{result.platform} · {result.contentType}</span><h3 title={decodeDisplayText(result.title)}>{decodeDisplayText(result.title) || "Imported reference"}</h3><p>{decodeDisplayText(result.description)}</p></div><strong>{result.videoFrameCount ? `${result.videoFrameCount} timeline shot${result.videoFrameCount === 1 ? "" : "s"}` : `${result.media.length} preview${result.media.length === 1 ? "" : "s"}`} found</strong></div>
            <div className="v25-selection-toolbar"><div><button type="button" onClick={() => onSelectAll(true)}>Select all</button><button type="button" onClick={() => onSelectAll(false)}>Clear all</button></div><span>{selectedCount} sections selected</span></div>
            <div className="v25-modal-body scroll">
              <UrlSelectionCard section="media" checked={selections.media} onToggle={() => onToggleSection("media")}>
                {isReelResult ? <p className="v25-frame-note"><strong>Choose one exact target shot.</strong> That frame alone controls camera side, crop, pose and perspective. Other checked frames are used only for outfit, lighting and visual continuity.</p> : null}
                {result.media.length ? <div className="v25-url-media-grid">{result.media.map((item, index) => (
                  <div className={classNames("v25-url-media-wrap", isReelResult && primaryMediaIndex === index && "primary")} key={`${item.sourceUrl}-${index}`}>
                    <button className={classNames("v25-url-media", selectedMedia.includes(index) && "selected")} type="button" onClick={() => onToggleMedia(index)}><div><Image src={item.dataUrl} alt={item.name} fill sizes="120px" unoptimized /></div><span>{selectedMedia.includes(index) ? "✓" : index + 1}</span></button>
                    {isReelResult ? <button className={classNames("v25-primary-frame-button", primaryMediaIndex === index && "active")} type="button" onClick={() => onPrimaryMedia(index)}>{primaryMediaIndex === index ? "Exact target" : "Use as target"}</button> : null}
                  </div>
                ))}</div> : <p className="v25-muted">No public preview images were exposed. You can still use the extracted concept.</p>}
                {result.platform === "Instagram" && result.contentType === "carousel-or-post" && result.media.length <= 1 ? <label className="v25-button secondary compact"><input type="file" multiple accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={(event) => { void onMissingSlides(event.target.files); event.currentTarget.value = ""; }} />Add missing carousel slides</label> : null}
              </UrlSelectionCard>
              <UrlSelectionCard section="summary" checked={selections.summary} onToggle={() => onToggleSection("summary")}><p>{result.ideas.creativeSummary}</p></UrlSelectionCard>
              <UrlSelectionCard section="camera" checked={selections.camera} onToggle={() => onToggleSection("camera")}><ul>{result.ideas.carouselSlides.slice(0, 4).map((item) => <li key={item.slide}>{item.cameraOrComposition}</li>)}</ul></UrlSelectionCard>
              <UrlSelectionCard section="pose" checked={selections.pose} onToggle={() => onToggleSection("pose")}><ul>{result.ideas.carouselSlides.slice(0, 4).map((item) => <li key={item.slide}>{item.poseOrAction}</li>)}</ul></UrlSelectionCard>
              <UrlSelectionCard section="carousel" checked={selections.carousel} onToggle={() => onToggleSection("carousel")}><ol>{result.ideas.carouselSlides.map((item) => <li key={item.slide}><strong>{item.purpose}</strong> — {item.visualIdea}</li>)}</ol></UrlSelectionCard>
              <UrlSelectionCard section="reel" checked={selections.reel} onToggle={() => onToggleSection("reel")}><ol>{result.ideas.reelBeats.map((item) => <li key={item.beat}><strong>{item.timing}</strong> — {item.visual}</li>)}</ol></UrlSelectionCard>
              <UrlSelectionCard section="elements" checked={selections.elements} onToggle={() => onToggleSection("elements")}><div className="v25-tag-list">{result.ideas.reusableElements.map((item) => <span key={item}>{item}</span>)}</div></UrlSelectionCard>
              <UrlSelectionCard section="adaptations" checked={selections.adaptations} onToggle={() => onToggleSection("adaptations")}><ul>{result.ideas.adaptationIdeas.map((item) => <li key={item}>{item}</li>)}</ul></UrlSelectionCard>
              {result.limitations.length ? <div className="v25-url-limit"><strong>Source limitations</strong>{result.limitations.map((item) => <p key={item}>{item}</p>)}</div> : null}
            </div>
            <footer className="v25-modal-footer"><button className="v25-button ghost" type="button" onClick={onClose}>Cancel</button><button className="v25-button primary" type="button" disabled={!selectedCount} onClick={onApply}>Add selected to shoot <span>→</span></button></footer>
          </>
        )}
      </section>
    </div>
  );
}

function UrlSelectionCard({ section, checked, onToggle, children }: { section: UrlSectionKey; checked: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <section className={classNames("v25-selection-card", checked && "selected")}>
      <button className="v25-selection-heading" type="button" onClick={onToggle}><span>{checked ? "✓" : ""}</span><div><strong>{URL_SECTION_LABELS[section].title}</strong><small>{URL_SECTION_LABELS[section].description}</small></div></button>
      {checked ? <div className="v25-selection-content">{children}</div> : null}
    </section>
  );
}

function FineTuneDrawer({
  config,
  validations,
  activeGroup,
  profiles,
  copied,
  onGroup,
  onChange,
  onProfile,
  onLoadProfile,
  onSaveProfile,
  onClose,
}: {
  config: PromptConfig;
  validations: PortraitValidation[];
  activeGroup: DrawerGroupKey;
  profiles: Record<string, SubjectPhysicalProfile>;
  copied: string;
  onGroup: (group: DrawerGroupKey) => void;
  onChange: <K extends keyof PromptConfig>(key: K, value: PromptConfig[K]) => void;
  onProfile: <K extends keyof SubjectPhysicalProfile>(key: K, value: SubjectPhysicalProfile[K]) => void;
  onLoadProfile: (name: string) => void;
  onSaveProfile: () => void;
  onClose: () => void;
}) {
  const group = DRAWER_GROUPS[activeGroup];
  return (
    <div className="v25-drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="v25-drawer" role="dialog" aria-modal="true" aria-label="Fine-tune the shot">
        <header className="v25-drawer-header"><div><span>FINE-TUNE</span><h2>Adjust one decision at a time</h2><p>Every change updates the prompt automatically.</p></div><button type="button" onClick={onClose} aria-label="Close">×</button></header>
        <div className="v25-drawer-nav">{(Object.keys(DRAWER_GROUPS) as DrawerGroupKey[]).map((key) => <button type="button" key={key} className={activeGroup === key ? "active" : ""} onClick={() => onGroup(key)}><span>{key === "pose" ? "♙" : key === "camera" ? "◉" : key === "lighting" ? "☼" : key === "outfit" ? "◇" : key === "location" ? "⌂" : "✦"}</span>{DRAWER_GROUPS[key].title}</button>)}</div>
        <div className="v25-drawer-body">
          <section className="v25-drawer-section"><span>NOW EDITING</span><h2>{group.title}</h2><p>{group.description}</p><div className="v25-form-grid one">{group.fields.map((field) => <label className="v25-field" key={field.key}><span>{field.label}</span><select value={config[field.key]} onChange={(event) => onChange(field.key, event.target.value)}>{field.options.map((option) => <option value={option} key={option}>{option}</option>)}</select></label>)}</div></section>

          {validations.length ? <section className="v25-realism-box"><div><span>PORTRAIT REALISM</span><h3>{validations.filter((item) => item.severity !== "info").length ? "Suggestions available" : "Looks realistic"}</h3></div>{validations.filter((item) => item.severity !== "info").slice(0, 4).map((item) => <article key={item.id}><strong>{item.category}</strong><p>{item.message}</p><small>{item.correction}</small></article>)}</section> : null}

          <details className="v25-disclosure profile-disclosure"><summary><span><strong>Subject physical profile</strong><small>Optional proportions and mobility notes</small></span><b>＋</b></summary><div className="v25-profile-form"><label className="v25-toggle-row"><input type="checkbox" checked={config.subjectProfile.enabled} onChange={(event) => onProfile("enabled", event.target.checked)} /><span><strong>Use physical profile</strong><small>Apply user-confirmed proportions to pose realism.</small></span></label>{Object.keys(profiles).length ? <label className="v25-field"><span>Load saved subject</span><select defaultValue="" onChange={(event) => { if (event.target.value) onLoadProfile(event.target.value); event.currentTarget.value = ""; }}><option value="">Choose a profile…</option>{Object.keys(profiles).map((name) => <option value={name} key={name}>{name}</option>)}</select></label> : null}<div className="v25-form-grid"><label className="v25-field"><span>Profile name</span><input value={config.subjectProfile.profileName} onChange={(event) => onProfile("profileName", event.target.value)} placeholder="Maria — portrait profile" /></label><label className="v25-field"><span>Height in cm — optional</span><input type="number" value={config.subjectProfile.heightCm} onChange={(event) => onProfile("heightCm", event.target.value)} /></label><ProfileField label="Overall build" field="overallBuild" profile={config.subjectProfile} onChange={onProfile} /><ProfileField label="Shoulders" field="shoulderProfile" profile={config.subjectProfile} onChange={onProfile} /><ProfileField label="Torso" field="torsoLength" profile={config.subjectProfile} onChange={onProfile} /><ProfileField label="Arms" field="armProportion" profile={config.subjectProfile} onChange={onProfile} /><ProfileField label="Legs" field="legProportion" profile={config.subjectProfile} onChange={onProfile} /><ProfileField label="Flexibility" field="flexibility" profile={config.subjectProfile} onChange={onProfile} /></div><label className="v25-field"><span>Mobility or comfort notes</span><textarea value={config.subjectProfile.mobilityNotes} onChange={(event) => onProfile("mobilityNotes", event.target.value)} placeholder="Avoid deep crouching; limited overhead shoulder range…" /></label><button className="v25-button secondary compact" type="button" onClick={onSaveProfile}>{copied === "profile" ? "Profile saved ✓" : "Save profile"}</button></div></details>
        </div>
        <footer className="v25-drawer-footer"><button className="v25-button primary" type="button" onClick={onClose}>Apply changes</button></footer>
      </aside>
    </div>
  );
}

function ProfileField<K extends keyof typeof SUBJECT_PROFILE_OPTIONS>({ label, field, profile, onChange }: { label: string; field: K; profile: SubjectPhysicalProfile; onChange: <T extends keyof SubjectPhysicalProfile>(key: T, value: SubjectPhysicalProfile[T]) => void }) {
  const options = SUBJECT_PROFILE_OPTIONS[field];
  return <label className="v25-field"><span>{label}</span><select value={profile[field] as string} onChange={(event) => onChange(field, event.target.value as SubjectPhysicalProfile[K])}>{options.map((option) => <option value={option} key={option}>{option}</option>)}</select></label>;
}

function ExportModal({ config, output, urlImport, outputs, onClose }: { config: PromptConfig; output: ReturnType<typeof buildPromptOutput>; urlImport: UrlImportResult | null; outputs: Record<OutputChoice, boolean>; onClose: () => void }) {
  const [formats, setFormats] = useState({ full: true, short: false, negative: false, json: false, shot: outputs.carousel || outputs.reel });
  function doExport() {
    const parts: string[] = [];
    if (formats.full) parts.push(output.fullPrompt);
    if (formats.short) parts.push(`--- SHORT PROMPT ---\n${output.compactPrompt}`);
    if (formats.negative) parts.push(`--- NEGATIVE PROMPT ---\n${output.negativePrompt}`);
    if (formats.shot && urlImport) {
      parts.push(`--- CAROUSEL PLAN ---\n${urlImport.ideas.carouselSlides.map((item) => `${item.slide}. ${item.purpose}: ${item.visualIdea}`).join("\n")}`);
      parts.push(`--- REEL PLAN ---\n${urlImport.ideas.reelBeats.map((item) => `${item.timing}: ${item.visual} — ${item.action}`).join("\n")}`);
    }
    if (formats.json) {
      downloadText(`${fileSlug(config.shootName)}-config.json`, JSON.stringify({ config, output }, null, 2), "application/json");
    }
    if (parts.length) downloadText(`${fileSlug(config.shootName)}-prompt.txt`, parts.join("\n\n"));
    onClose();
  }
  return (
    <div className="v25-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="v25-modal export-modal" role="dialog" aria-modal="true"><header className="v25-modal-header"><div><span>EXPORT</span><h2>Export your shoot</h2><p>Choose the files you want PromptLens to prepare.</p></div><button type="button" onClick={onClose}>×</button></header><div className="v25-modal-body"><label className="v25-field"><span>Filename</span><input value={fileSlug(config.shootName)} readOnly /></label><div className="v25-export-list">{[
      ["full", "Full prompt — TXT"], ["short", "Short prompt — TXT"], ["negative", "Negative prompt — TXT"], ["json", "Shot configuration — JSON"], ["shot", "Carousel / Reel plan — TXT"],
    ].map(([key, label]) => <label key={key}><input type="checkbox" checked={formats[key as keyof typeof formats]} onChange={(event) => setFormats((current) => ({ ...current, [key]: event.target.checked }))} /><span>{label}</span></label>)}</div></div><footer className="v25-modal-footer"><button className="v25-button ghost" type="button" onClick={onClose}>Cancel</button><button className="v25-button primary" type="button" onClick={doExport}>Export selected</button></footer></section></div>
  );
}
