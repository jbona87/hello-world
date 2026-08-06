export type ProjectType =
  | "portrait"
  | "beauty editorial"
  | "fashion editorial"
  | "lifestyle portrait"
  | "product photography"
  | "cinematic scene";

export type AnalysisMode =
  | "inspired"
  | "close reconstruction"
  | "technical breakdown"
  | "prompt recovery";

export type GeneratorTarget =
  | "ChatGPT Images"
  | "Midjourney"
  | "FLUX"
  | "Gemini"
  | "Stable Diffusion"
  | "General";

export type IdentityStrength = "none" | "standard" | "maximum";

export type AiSpeed = "fast" | "balanced" | "quality";

export type ReferenceRole =
  | "shot"
  | "identity"
  | "pose"
  | "wardrobe"
  | "lighting"
  | "environment"
  | "general";

export type SubjectPhysicalProfile = {
  enabled: boolean;
  profileName: string;
  heightCm: string;
  overallBuild: string;
  shoulderProfile: string;
  neckLength: string;
  torsoLength: string;
  armProportion: string;
  legProportion: string;
  hipBalance: string;
  baselinePosture: string;
  flexibility: string;
  mobilityNotes: string;
  preferredSide: string;
  visualNotes: string;
};

export type PromptConfig = {
  shootName: string;
  projectType: ProjectType;
  mode: AnalysisMode;
  generator: GeneratorTarget;
  aiSpeed: AiSpeed;
  identityStrength: IdentityStrength;
  preserveHair: boolean;
  preserveBodyProportions: boolean;
  preserveSourcePerspective: boolean;
  faceDetailPriority: boolean;
  subjectProfile: SubjectPhysicalProfile;

  pose: string;
  mainPosition: string;
  bodyOrientation: string;
  weightDistribution: string;
  headPosition: string;
  armPosition: string;
  handPosition: string;
  movement: string;
  poseEnergy: string;
  expression: string;
  gaze: string;

  shotSize: string;
  composition: string;
  cropRule: string;

  camera: string;
  cameraFormat: string;
  lens: string;
  aperture: string;
  shutterSpeed: string;
  iso: string;
  cameraDistance: string;
  cameraAngle: string;
  focusPlane: string;
  depthOfField: string;

  lighting: string;
  lightSource: string;
  lightModifier: string;
  lightDirection: string;
  lightQuality: string;
  fillLevel: string;
  separationLight: string;

  wardrobe: string;
  wardrobeCategory: string;
  mainGarment: string;
  silhouette: string;
  material: string;
  stylingState: string;
  footwear: string;
  accessories: string;

  background: string;
  locationCategory: string;
  surface: string;
  timeOfDay: string;
  weather: string;
  environmentalDepth: string;
  props: string;

  realism: string;
  mood: string;
  makeup: string;
  hair: string;
  colourGrade: string;
  retouching: string;
  grain: string;
  aspectRatio: string;
  notes: string;
};

export type ReferenceImage = {
  id: string;
  name: string;
  dataUrl: string;
  role: ReferenceRole;
  compressedBytes: number;
};

export type ShotAnalysis = {
  index: number;
  role: string;
  pose: string;
  expression: string;
  wardrobe: string;
  lighting: string;
  camera: string;
  composition: string;
  environment: string;
};

export type AnalysisConflict = {
  category: string;
  issue: string;
  recommendation: string;
};

export type ShootDNA = {
  subjectLock: string;
  wardrobeLock: string;
  environmentLock: string;
  lightingLock: string;
  cameraLanguage: string;
  colourTreatment: string;
  realismLock: string;
};

export type AnalysisResult = {
  projectTitle: string;
  detectedSummary: string;
  shootDNA: ShootDNA;
  suggestedConfig: Partial<PromptConfig>;
  shots: ShotAnalysis[];
  conflicts: AnalysisConflict[];
  coach: string[];
};

export type PortraitValidationSeverity = "info" | "warning" | "error";

export type PortraitValidation = {
  id: string;
  severity: PortraitValidationSeverity;
  category: string;
  message: string;
  correction: string;
};

export type PromptOutput = {
  fullPrompt: string;
  compactPrompt: string;
  negativePrompt: string;
  codeView: string;
  structuredConfig: PromptConfig;
  validations: PortraitValidation[];
};

export type SavedShoot = {
  id: string;
  name: string;
  updatedAt: string;
  config: PromptConfig;
  analysis: AnalysisResult | null;
};
