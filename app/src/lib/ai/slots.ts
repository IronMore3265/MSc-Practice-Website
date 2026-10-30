// Which router slots exist. Model names and which keys are present come from the environment (plan 5b).
// Slot order is the fallback order: key A primary, key A backup, key B primary, key B backup.

export type SlotSpec = { key_name: "A" | "B"; tier: "primary" | "backup"; model: string; priority: number };

type Env = Record<string, string | undefined>;

export function slotSpecs(env: Env): SlotSpec[] {
  const primary = env.GEMINI_MODEL_PRIMARY?.trim();
  const backup = env.GEMINI_MODEL_BACKUP?.trim();
  const out: SlotSpec[] = [];
  (["A", "B"] as const).forEach((key_name, i) => {
    if (!env[`GEMINI_KEY_${key_name}`]?.trim()) return;
    if (primary) out.push({ key_name, tier: "primary", model: primary, priority: i * 2 + 1 });
    if (backup) out.push({ key_name, tier: "backup", model: backup, priority: i * 2 + 2 });
  });
  return out;
}

export function apiKeyFor(keyName: string, env: Env): string | null {
  return env[`GEMINI_KEY_${keyName}`]?.trim() || null;
}
