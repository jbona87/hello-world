import type { AiSpeed, ReferenceRole, SubjectPhysicalProfile } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_IMAGES = 6;
const MAX_DATA_URL_LENGTH = 650_000;
const MAX_COMBINED_LENGTH = 3_200_000;

const SUGGESTED_STRING_FIELDS = [
  "pose",
  "mainPosition",
  "bodyOrientation",
  "weightDistribution",
  "headPosition",
  "armPosition",
  "handPosition",
  "movement",
  "poseEnergy",
  "expression",
  "gaze",
  "shotSize",
  "composition",
  "cropRule",
  "camera",
  "cameraFormat",
  "lens",
  "aperture",
  "shutterSpeed",
  "iso",
  "cameraDistance",
  "cameraAngle",
  "focusPlane",
  "depthOfField",
  "lighting",
  "lightSource",
  "lightModifier",
  "lightDirection",
  "lightQuality",
  "fillLevel",
  "separationLight",
  "wardrobe",
  "wardrobeCategory",
  "mainGarment",
  "silhouette",
  "material",
  "stylingState",
  "footwear",
  "accessories",
  "background",
  "locationCategory",
  "surface",
  "timeOfDay",
  "weather",
  "environmentalDepth",
  "props",
  "realism",
  "mood",
  "makeup",
  "hair",
  "colourGrade",
  "retouching",
  "grain",
] as const;

const suggestedProperties = Object.fromEntries(
  SUGGESTED_STRING_FIELDS.map((field) => [field, { type: "string" }]),
);

const analysisSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    projectTitle: { type: "string" },
    detectedSummary: { type: "string" },
    shootDNA: {
      type: "object",
      additionalProperties: false,
      properties: {
        subjectLock: { type: "string" },
        wardrobeLock: { type: "string" },
        environmentLock: { type: "string" },
        lightingLock: { type: "string" },
        cameraLanguage: { type: "string" },
        colourTreatment: { type: "string" },
        realismLock: { type: "string" },
      },
      required: [
        "subjectLock",
        "wardrobeLock",
        "environmentLock",
        "lightingLock",
        "cameraLanguage",
        "colourTreatment",
        "realismLock",
      ],
    },
    suggestedConfig: {
      type: "object",
      additionalProperties: false,
      properties: suggestedProperties,
      required: [...SUGGESTED_STRING_FIELDS],
    },
    shots: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          index: { type: "integer" },
          role: { type: "string" },
          pose: { type: "string" },
          expression: { type: "string" },
          wardrobe: { type: "string" },
          lighting: { type: "string" },
          camera: { type: "string" },
          composition: { type: "string" },
          environment: { type: "string" },
        },
        required: [
          "index",
          "role",
          "pose",
          "expression",
          "wardrobe",
          "lighting",
          "camera",
          "composition",
          "environment",
        ],
      },
    },
    conflicts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          category: { type: "string" },
          issue: { type: "string" },
          recommendation: { type: "string" },
        },
        required: ["category", "issue", "recommendation"],
      },
    },
    coach: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: [
    "projectTitle",
    "detectedSummary",
    "shootDNA",
    "suggestedConfig",
    "shots",
    "conflicts",
    "coach",
  ],
} as const;

type UrlSourceContext = {
  sourceUrl?: string;
  platform?: string;
  contentType?: string;
  title?: string;
  description?: string;
  creativeSummary?: string;
  carouselPlan?: string;
  reelPlan?: string;
  reusableElements?: string[];
  adaptationIdeas?: string[];
  primaryShotName?: string;
  reelFrameMode?: string;
};

type AnalyseRequest = {
  images?: Array<{
    dataUrl?: string;
    role?: ReferenceRole;
    name?: string;
  }>;
  sourceContext?: UrlSourceContext;
  options?: {
    shootName?: string;
    projectType?: string;
    mode?: string;
    generator?: string;
    aiSpeed?: AiSpeed;
    identityStrength?: string;
    preserveHair?: boolean;
    preserveBodyProportions?: boolean;
    preserveSourcePerspective?: boolean;
    faceDetailPriority?: boolean;
    subjectProfile?: SubjectPhysicalProfile;
    notes?: string;
  };
};

function extractOutputText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const response = payload as {
    output_text?: string;
    output?: Array<{
      content?: Array<{ type?: string; text?: string }>;
    }>;
  };

  if (typeof response.output_text === "string") return response.output_text;

  return (response.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((part) => part.type === "output_text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n");
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end <= start) throw new Error("The analysis response was not valid JSON.");
    return JSON.parse(text.slice(start, end + 1));
  }
}

function validateImages(images: AnalyseRequest["images"]) {
  if (!Array.isArray(images)) return;
  if (images.length > MAX_IMAGES) {
    throw new Error(`PromptLens supports up to ${MAX_IMAGES} images per analysis.`);
  }

  let combinedLength = 0;
  for (const image of images) {
    if (!image.dataUrl?.startsWith("data:image/")) {
      throw new Error("One reference was not a supported image data URL.");
    }
    if (image.dataUrl.length > MAX_DATA_URL_LENGTH) {
      throw new Error("One reference is still too large. Remove it or use a smaller image.");
    }
    combinedLength += image.dataUrl.length;
  }

  if (combinedLength > MAX_COMBINED_LENGTH) {
    throw new Error("The combined reference pack is too large. Analyse fewer images at once.");
  }
}

function profileSummary(profile?: SubjectPhysicalProfile): string {
  if (!profile?.enabled) return "No saved subject physical profile.";
  return [
    `Profile name: ${profile.profileName || "Unnamed"}`,
    profile.heightCm ? `User-provided height: ${profile.heightCm} cm` : "Height not supplied",
    `Build: ${profile.overallBuild}`,
    `Shoulders: ${profile.shoulderProfile}`,
    `Neck: ${profile.neckLength}`,
    `Torso: ${profile.torsoLength}`,
    `Arms: ${profile.armProportion}`,
    `Legs: ${profile.legProportion}`,
    `Hip line: ${profile.hipBalance}`,
    `Baseline posture: ${profile.baselinePosture}`,
    `Flexibility: ${profile.flexibility}`,
    `Preferred side: ${profile.preferredSide}`,
    `Mobility notes: ${profile.mobilityNotes || "None"}`,
    `Other user-confirmed visual notes: ${profile.visualNotes || "None"}`,
  ].join("\n");
}

const MODEL_BY_SPEED: Record<AiSpeed, string> = {
  fast: process.env.OPENAI_FAST_MODEL || "gpt-5-nano",
  balanced: process.env.OPENAI_BALANCED_MODEL || process.env.OPENAI_MODEL || "gpt-5-mini",
  quality: process.env.OPENAI_QUALITY_MODEL || "gpt-5",
};

function normaliseSpeed(value?: string): AiSpeed {
  return value === "balanced" || value === "quality" ? value : "fast";
}


type ReferenceImageInput = NonNullable<AnalyseRequest["images"]>[number];

function pushUnique(target: ReferenceImageInput[], image?: ReferenceImageInput) {
  if (!image || target.includes(image)) return;
  target.push(image);
}

function selectAnalysisImages(images: ReferenceImageInput[], speed: AiSpeed) {
  const limit = speed === "fast" ? 3 : speed === "balanced" ? 4 : 5;
  const selected: ReferenceImageInput[] = [];
  const primary =
    images.find((image) => /PRIMARY REEL SHOT/i.test(image.name || "")) ??
    images.find((image) => image.role === "shot") ??
    images.find((image) => image.role !== "identity");
  const identity = images.find((image) => image.role === "identity");

  pushUnique(selected, primary);
  pushUnique(selected, identity);

  const roleOrder: ReferenceRole[] = ["pose", "wardrobe", "lighting", "environment", "general", "shot"];
  for (const role of roleOrder) {
    for (const image of images) {
      if (selected.length >= limit) break;
      if (image.role === role) pushUnique(selected, image);
    }
    if (selected.length >= limit) break;
  }

  for (const image of images) {
    if (selected.length >= limit) break;
    pushUnique(selected, image);
  }

  return selected.slice(0, limit);
}

function selectMinimalImages(images: ReferenceImageInput[]) {
  const selected: ReferenceImageInput[] = [];
  pushUnique(
    selected,
    images.find((image) => /PRIMARY REEL SHOT/i.test(image.name || "")) ??
      images.find((image) => image.role === "shot") ??
      images.find((image) => image.role !== "identity"),
  );
  pushUnique(selected, images.find((image) => image.role === "identity"));
  return selected;
}

function fallbackSuggestedValue(field: (typeof SUGGESTED_STRING_FIELDS)[number]) {
  const exactPrimary = "Match the primary shot reference exactly; do not blend supporting viewpoints.";
  const values: Partial<Record<(typeof SUGGESTED_STRING_FIELDS)[number], string>> = {
    pose: exactPrimary,
    mainPosition: "Use the primary shot's visible body position.",
    bodyOrientation: "Preserve the primary shot's torso and shoulder orientation.",
    weightDistribution: "Keep anatomically supported weight and visible contact points.",
    headPosition: "Match the primary shot's visible head angle without extreme neck rotation.",
    armPosition: "Match the primary shot while keeping the arms naturally supported.",
    handPosition: "Match visible hand placement with separated, relaxed fingers.",
    movement: "Freeze the exact visible moment from the primary reference.",
    poseEnergy: "Natural and unforced.",
    expression: "Use the requested identity subject with a natural expression appropriate to the shot.",
    gaze: "Match the primary shot's gaze direction.",
    shotSize: "Match the primary shot's framing and subject scale.",
    composition: "Preserve frame edges, negative space, horizon and subject placement.",
    cropRule: "Preserve the source crop while avoiding accidental cuts through major joints.",
    camera: "Use the primary shot as the sole camera-view target.",
    cameraFormat: "Professional full-frame or medium-format photographic rendering.",
    lens: "Match the source perspective without wide-angle facial distortion.",
    aperture: "Use enough depth of field for the visible head angle and focus requirement.",
    shutterSpeed: "Fast enough to keep the subject sharp for the visible movement.",
    iso: "Use the lowest practical ISO for the lighting level.",
    cameraDistance: "Preserve the primary shot's apparent subject-to-camera distance.",
    cameraAngle: "Preserve the primary shot's camera side and height exactly.",
    focusPlane: "Nearest eye critically sharp; identity facial detail prioritised.",
    depthOfField: "Natural optical depth of field consistent with lens, distance and aperture.",
    lighting: "Match the primary shot's motivated lighting design.",
    lightSource: "One coherent dominant source matching the reference.",
    lightModifier: "Use a plausible modifier for the observed shadow softness.",
    lightDirection: "Keep highlights, shadows and catchlights directionally consistent.",
    lightQuality: "Natural photographic falloff without synthetic glow.",
    fillLevel: "Retain believable shadow depth.",
    separationLight: "Only when visibly supported by the reference.",
    wardrobe: "Match the selected source wardrobe without copying identity characteristics.",
    wardrobeCategory: "Use the source garment category.",
    mainGarment: "Recreate the visible garment construction and fit.",
    silhouette: "Preserve the source silhouette and layering.",
    material: "Render material weight, sheen, tension and folds realistically.",
    stylingState: "Match the visible styling state and closures.",
    footwear: "Match visible footwear when present.",
    accessories: "Include only clearly visible accessories.",
    background: "Match the primary shot's background design.",
    locationCategory: "Use the source location category.",
    surface: "Match visible floor, wall and furnishing surfaces.",
    timeOfDay: "Infer only when visually supported; otherwise keep neutral.",
    weather: "Use only visually supported weather conditions.",
    environmentalDepth: "Preserve the source depth and spatial layering.",
    props: "Include only clearly visible props.",
    realism: "Photographic anatomy, coherent perspective, natural skin texture and material physics.",
    mood: "Preserve the selected source mood.",
    makeup: "Natural, source-appropriate makeup without plastic retouching.",
    hair: "Use the identity hairstyle when preservation is enabled; otherwise follow the selected direction.",
    colourGrade: "Match source contrast, white balance and palette without overprocessing.",
    retouching: "Minimal editorial retouching; preserve pores and natural asymmetry.",
    grain: "Subtle photographic grain only when appropriate.",
  };
  return values[field] || exactPrimary;
}

function buildLocalFallback(
  options: NonNullable<AnalyseRequest["options"]>,
  sourceContext: UrlSourceContext | undefined,
  images: ReferenceImageInput[],
  reason: string,
) {
  const suggestedConfig = Object.fromEntries(
    SUGGESTED_STRING_FIELDS.map((field) => [field, fallbackSuggestedValue(field)]),
  );
  const shotImages = images.filter((image) => image.role !== "identity");
  return {
    projectTitle: options.shootName || sourceContext?.title || "PromptLens shoot",
    detectedSummary:
      sourceContext?.creativeSummary ||
      sourceContext?.description ||
      "A reduced-time analysis was created from the primary shot and the available reference labels.",
    shootDNA: {
      subjectLock: images.some((image) => image.role === "identity")
        ? "Use the identity-labelled image as the sole facial identity source."
        : "Use a new generic adult subject; no identity preservation is claimed.",
      wardrobeLock: "Use the selected source wardrobe and material behaviour.",
      environmentLock: "Preserve the primary shot's visible location and spatial arrangement.",
      lightingLock: "Preserve the primary shot's coherent key-light direction and shadow logic.",
      cameraLanguage: "Use the primary frame as the sole exact camera and perspective target.",
      colourTreatment: "Match the visible source palette and contrast naturally.",
      realismLock: "Natural anatomy, coherent perspective, realistic skin texture and physically plausible materials.",
    },
    suggestedConfig,
    shots: (shotImages.length ? shotImages : images).slice(0, 5).map((image, index) => ({
      index: index + 1,
      role: image.role || "general",
      pose: index === 0 ? "Exact primary-reference pose." : "Continuity reference only; do not blend its pose into the primary shot.",
      expression: "Use a natural expression appropriate to this frame.",
      wardrobe: "Preserve visible wardrobe continuity.",
      lighting: "Preserve visible lighting character without mixing conflicting directions.",
      camera: index === 0 ? "Exact target camera view." : "Separate supporting view; not part of the target perspective.",
      composition: index === 0 ? "Preserve this frame exactly." : "Treat as a separate shot.",
      environment: "Preserve visible environmental continuity.",
    })),
    conflicts: [
      {
        category: "Analysis timing",
        issue: reason,
        recommendation: "PromptLens used the primary shot and identity reference rather than failing the shoot.",
      },
    ],
    coach: [
      "The primary shot remains the exact pose, crop and perspective target.",
      "Supporting Reel frames are continuity-only and must not be blended into the main image.",
      "Use Balanced or Best detail later when a deeper breakdown is needed.",
    ],
  };
}

async function requestOpenAI(payload: Record<string, unknown>, model: string, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({ ...payload, model }),
    });
    const rawText = await response.text();
    let parsed: unknown;
    try { parsed = JSON.parse(rawText); }
    catch { throw new Error(`OpenAI returned a non-JSON response (${response.status}).`); }
    return { response, payload: parsed };
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return Response.json(
      {
        error:
          "PromptLens is not connected to OpenAI. Add OPENAI_API_KEY in Vercel Settings → Environment Variables, then redeploy.",
      },
      { status: 503 },
    );
  }

  try {
    const body = (await request.json()) as AnalyseRequest;
    validateImages(body.images);
    const images = body.images ?? [];
    const sourceContext = body.sourceContext;
    if (images.length === 0 && !sourceContext?.sourceUrl && !sourceContext?.creativeSummary) {
      throw new Error("Add an image or import a public URL before analysis.");
    }

    const options = body.options ?? {};
    const requestedSpeed = normaliseSpeed(options.aiSpeed);
    const requestedModel = MODEL_BY_SPEED[requestedSpeed];
    const balancedModel = MODEL_BY_SPEED.balanced;
    const analysisImages = selectAnalysisImages(images, requestedSpeed);
    const minimalImages = selectMinimalImages(images);
    const deferredCount = Math.max(0, images.length - analysisImages.length);

    const roleSummary = images.length
      ? images
          .map(
            (image, index) =>
              `Reference ${index + 1}: ${image.role ?? "general"} — ${image.name || "unnamed"}${
                analysisImages.includes(image) ? " — included visually" : " — deferred continuity label only"
              }`,
          )
          .join("\n")
      : "No image references were supplied. Use only the URL source context below and do not claim visual details that were not provided.";
    const sourceSummary = sourceContext
      ? [
          `Source URL: ${sourceContext.sourceUrl || "Not supplied"}`,
          `Platform: ${sourceContext.platform || "Unknown"}`,
          `Content type: ${sourceContext.contentType || "Unknown"}`,
          `Title: ${sourceContext.title || "Untitled"}`,
          `Description: ${sourceContext.description || "None"}`,
          `Creative summary: ${sourceContext.creativeSummary || "None"}`,
          `Carousel plan: ${sourceContext.carouselPlan || "None"}`,
          `Reel plan: ${sourceContext.reelPlan || "None"}`,
          `Reusable elements: ${(sourceContext.reusableElements || []).join(", ") || "None"}`,
          `Adaptation ideas: ${(sourceContext.adaptationIdeas || []).join("; ") || "None"}`,
          `Primary shot frame: ${sourceContext.primaryShotName || "Not specified"}`,
          `Reel frame handling: ${sourceContext.reelFrameMode || "Not specified"}`,
        ].join("\n")
      : "No URL source context.";

    function buildPayload(selectedImages: ReferenceImageInput[], compactRetry = false) {
      const userContent: Array<Record<string, string>> = [
        {
          type: "input_text",
          text: `Analyse this visual reference set for PromptLens.

Shoot name: ${options.shootName ?? "Untitled portrait shoot"}
Project type: ${options.projectType ?? "portrait"}
Analysis mode: ${options.mode ?? "close reconstruction"}
Target generator: ${options.generator ?? "ChatGPT Images"}
AI processing mode: ${requestedSpeed}
Identity strength: ${options.identityStrength ?? "maximum"}
Preserve hair: ${Boolean(options.preserveHair)}
Preserve body proportions: ${Boolean(options.preserveBodyProportions)}
Preserve exact source perspective: ${options.preserveSourcePerspective !== false}
Face-detail priority: ${Boolean(options.faceDetailPriority)}
User notes: ${options.notes?.trim() || "None"}
Reduced retry: ${compactRetry}

User-confirmed physical profile:
${profileSummary(options.subjectProfile)}

Reference roles:
${roleSummary}

URL source context:
${sourceSummary}

Treat every person visible in shot, URL, carousel, Reel, pose, wardrobe, lighting, environment and general references as an anonymous visual placeholder. Never identify, name, describe, imitate or reproduce those people. Ignore their face, facial geometry, skin tone, age appearance, hairstyle, body identity, voice, persona and all other identifying characteristics.

Use the shot-labelled reference only as a photographic-design target. Extract its non-identifying pose geometry, body orientation, limb and hand placement, framing, crop, camera height, lens perspective, outfit construction, materials, lighting direction, background, location, colour treatment and overall visual rhythm.

PERSPECTIVE LOCK: Treat every selected source image or Reel frame as an exact two-dimensional camera view. Preserve the visible camera side, camera height, subject-to-camera distance, lens perspective, horizon, vanishing-point direction, frame edges, crop and subject scale. Never infer an unseen reverse angle, move the camera to another side, or average several frames into a synthetic viewpoint. When several frames show different shots, analyse them as separate shots rather than blending their perspectives.

REEL PRIMARY-FRAME RULE: For a Reel or video import, the reference labelled "PRIMARY REEL SHOT" with role "shot" is the only exact image-generation target. It exclusively controls pose, camera side, camera height, subject distance, lens perspective, horizon, crop, frame edges and subject scale. References labelled "REEL CONTINUITY ONLY" or role "general" may contribute only recurring outfit, materials, lighting character, colour and location continuity. Never borrow their camera angle, crop, pose, body orientation, subject scale or perspective. Produce the main image from the primary frame only. When a Reel plan is requested, describe the other detected shots separately rather than merging them into the main image.

Use the identity-labelled reference as the sole source for the generated person's recognisable identity and natural identifying characteristics. Create a new image featuring that identity subject while applying only the non-identifying shot design extracted from the other references. Never blend faces or identity characteristics between references. If no identity image exists, do not claim identity preservation and create a new generic adult subject.

Apply professional portrait plausibility: avoid close-range facial distortion; keep the nearest eye sharp; use coherent light and catchlights; keep joints, support and weight distribution natural; avoid fused hands and unsafe crops; preserve material physics and background separation.

The physical profile contains user-confirmed relative proportions. Do not infer exact height, measurements, diagnoses, age, ethnicity or other sensitive traits from the photographs. Do not overwrite the user's physical profile with guesses.

Return concise practical values for the editor. ${
            deferredCount
              ? `${deferredCount} supporting references were intentionally deferred to keep the request fast. Do not invent their unseen details.`
              : "All supplied references are represented."
          }`,
        },
      ];

      selectedImages.forEach((image, index) => {
        const isPrimary = /PRIMARY REEL SHOT/i.test(image.name || "") || (index === 0 && image.role === "shot");
        userContent.push({
          type: "input_text",
          text: `Reference ${index + 1} role: ${image.role ?? "general"}. Name: ${image.name || "unnamed"}.`,
        });
        userContent.push({
          type: "input_image",
          image_url: image.dataUrl!,
          detail: image.role === "identity" || isPrimary || requestedSpeed !== "fast" ? "high" : "low",
        });
      });

      return {
        instructions:
          "You are PromptLens, a senior portrait photographer, art director, stylist, lighting technician, posing director, and visual prompt engineer. Describe visible evidence before inference. Keep the primary shot's perspective exact. Return concise structured values quickly.",
        input: [{ role: "user", content: userContent }],
        text: {
          format: {
            type: "json_schema",
            name: "promptlens_analysis",
            description: "Structured multi-reference portrait analysis for a physically plausible editable prompt builder.",
            strict: true,
            schema: analysisSchema,
          },
        },
        max_output_tokens: compactRetry ? 5_000 : requestedSpeed === "quality" ? 8_000 : 6_000,
      } as Record<string, unknown>;
    }

    const firstTimeout = requestedSpeed === "fast" ? 22_000 : requestedSpeed === "balanced" ? 28_000 : 34_000;
    let usedModel = requestedModel;
    let fallback = false;
    let degraded = false;
    let result: Awaited<ReturnType<typeof requestOpenAI>> | undefined;
    let failureReason = "The full analysis took longer than expected.";

    try {
      result = await requestOpenAI(buildPayload(analysisImages), requestedModel, firstTimeout);
      if (!result.response.ok) {
        const apiError = result.payload as { error?: { message?: string } };
        failureReason = apiError.error?.message || `OpenAI request failed (${result.response.status}).`;
        result = undefined;
      }
    } catch (error) {
      failureReason = error instanceof Error ? error.message : failureReason;
    }

    if (!result) {
      fallback = true;
      usedModel = balancedModel;
      try {
        const retry = await requestOpenAI(buildPayload(minimalImages, true), balancedModel, 16_000);
        if (retry.response.ok) result = retry;
        else {
          const apiError = retry.payload as { error?: { message?: string } };
          failureReason = apiError.error?.message || `OpenAI retry failed (${retry.response.status}).`;
        }
      } catch (error) {
        failureReason = error instanceof Error ? error.message : failureReason;
      }
    }

    if (!result) {
      degraded = true;
      return Response.json({
        analysis: buildLocalFallback(options, sourceContext, minimalImages.length ? minimalImages : images, failureReason),
        meta: {
          requestedSpeed,
          model: usedModel,
          fallback: true,
          degraded: true,
          referencesReceived: images.length,
          referencesAnalysed: minimalImages.length,
          referencesDeferred: Math.max(0, images.length - minimalImages.length),
        },
      });
    }

    const outputText = extractOutputText(result.payload);
    if (!outputText) {
      degraded = true;
      return Response.json({
        analysis: buildLocalFallback(options, sourceContext, minimalImages.length ? minimalImages : images, "OpenAI returned no analysis text."),
        meta: {
          requestedSpeed,
          model: usedModel,
          fallback: true,
          degraded,
          referencesReceived: images.length,
          referencesAnalysed: minimalImages.length,
          referencesDeferred: Math.max(0, images.length - minimalImages.length),
        },
      });
    }

    return Response.json({
      analysis: parseJson(outputText),
      meta: {
        requestedSpeed,
        model: usedModel,
        fallback,
        degraded,
        referencesReceived: images.length,
        referencesAnalysed: fallback ? minimalImages.length : analysisImages.length,
        referencesDeferred: fallback
          ? Math.max(0, images.length - minimalImages.length)
          : Math.max(0, images.length - analysisImages.length),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The analysis failed unexpectedly.";
    return Response.json({ error: message }, { status: 400 });
  }
}

