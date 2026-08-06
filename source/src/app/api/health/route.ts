export const runtime = "nodejs";

export async function GET() {
  const fast = process.env.OPENAI_FAST_MODEL || "gpt-5-nano";
  const balanced = process.env.OPENAI_BALANCED_MODEL || process.env.OPENAI_MODEL || "gpt-5-mini";
  const quality = process.env.OPENAI_QUALITY_MODEL || "gpt-5";

  return Response.json({
    ok: true,
    openAIConfigured: Boolean(process.env.OPENAI_API_KEY),
    model: fast,
    defaultSpeed: "fast",
    models: { fast, balanced, quality },
  });
}
