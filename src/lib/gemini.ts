import "server-only";

import { ApiError, GoogleGenAI } from "@google/genai";
import { env } from "~/env";

/**
 * Pinned Flash model. The `gemini-flash-latest` alias currently resolves to a
 * model that is frequently overloaded (503), so pin one and let
 * GEMINI_MODEL override it.
 */
export const GEMINI_MODEL = env.GEMINI_MODEL ?? "gemini-3.6-flash";

const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

export class GeminiError extends Error {
  constructor(
    message: string,
    readonly rawText?: string,
  ) {
    super(message);
    this.name = "GeminiError";
  }
}

/** Rate limits and transient server errors ("high demand" 503s) are retried. */
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 6;
const MAX_DELAY_MS = 60_000;

/** Google's 429s say how long to wait ("retryDelay":"8s"); honour it. */
function serverRetryDelayMs(err: unknown): number | null {
  const match = /"retryDelay":"(\d+(?:\.\d+)?)s"/.exec(
    err instanceof Error ? err.message : "",
  );
  return match ? Math.ceil(Number(match[1]) * 1000) + 500 : null;
}

async function generateWithRetry(
  request: Parameters<typeof ai.models.generateContent>[0],
) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await ai.models.generateContent(request);
    } catch (err) {
      const status = err instanceof ApiError ? err.status : undefined;
      // A per-day quota won't recover by waiting; fail fast and say so.
      if (status === 429 && String(err).includes("PerDay")) {
        throw new GeminiError(
          `Gemini daily quota exhausted for ${GEMINI_MODEL} (free tier: 20 requests/day per model). ` +
            `Enable billing on the Google Cloud project or set GEMINI_MODEL to another model. Raw: ${String(err).slice(0, 300)}`,
        );
      }
      if (
        attempt >= MAX_ATTEMPTS ||
        status === undefined ||
        !RETRYABLE_STATUS.has(status)
      ) {
        throw err;
      }
      // Server-suggested delay for quota errors, else 2s, 4s, 8s... (+ jitter)
      const delayMs = Math.min(
        MAX_DELAY_MS,
        serverRetryDelayMs(err) ?? 2000 * 2 ** (attempt - 1) + Math.random() * 500,
      );
      console.warn(
        `[gemini] ${status} on attempt ${attempt}/${MAX_ATTEMPTS}; retrying in ${Math.round(delayMs)}ms`,
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

/**
 * One structured-output call. `responseSchema` is standard JSON Schema; the
 * model's reply is parsed and returned as T. The model only reasons and
 * writes prose here — it never computes scores or margins.
 */
export async function callGemini<T>(opts: {
  systemInstruction: string;
  prompt: string;
  responseSchema: object;
}): Promise<T> {
  const response = await generateWithRetry({
    model: GEMINI_MODEL,
    contents: opts.prompt,
    config: {
      systemInstruction: opts.systemInstruction,
      responseMimeType: "application/json",
      responseJsonSchema: opts.responseSchema,
    },
  });

  const text = response.text;
  if (!text) {
    const reason = response.candidates?.[0]?.finishReason ?? "unknown";
    throw new GeminiError(`Gemini returned no text (finishReason: ${reason})`);
  }
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    throw new GeminiError(
      `Gemini returned invalid JSON (${err instanceof Error ? err.message : String(err)}). Raw text: ${text}`,
      text,
    );
  }
}
