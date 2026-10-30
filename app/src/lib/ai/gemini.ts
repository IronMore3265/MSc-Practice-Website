import "server-only";
import { GoogleGenAI } from "@google/genai";
import { ModelOutputError } from "./errors";

// A healthy call takes well under a minute. Longer means the model is hanging, so give up and let the router try another slot.
const TIMEOUT_MS = 120_000;

// One Gemini call that must answer with JSON. Only the router calls this (plan 5b): it picks the key and model.
export type InlineImage = { mimeType: string; data: string }; // data is base64

export async function generateJson(args: {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  schema: unknown;
  images?: InlineImage[];
  temperature?: number;
}): Promise<unknown> {
  // The router owns retries and pacing, so the SDK must not quietly retry on its own (its default is 5 attempts).
  const ai = new GoogleGenAI({ apiKey: args.apiKey, httpOptions: { retryOptions: { attempts: 1 } } });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await ai.models.generateContent({
      model: args.model,
      contents: args.images?.length
        ? [{ role: "user", parts: [...args.images.map((i) => ({ inlineData: i })), { text: args.user }] }]
        : args.user,
      config: {
        systemInstruction: args.system,
        responseMimeType: "application/json",
        responseJsonSchema: args.schema,
        temperature: args.temperature ?? 0.6,
        abortSignal: controller.signal,
      },
    });
    const text = res.text;
    if (!text) throw new ModelOutputError("The model returned no text.");
    try {
      return JSON.parse(text);
    } catch {
      throw new ModelOutputError("The model did not return valid JSON.");
    }
  } finally {
    clearTimeout(timer);
  }
}
