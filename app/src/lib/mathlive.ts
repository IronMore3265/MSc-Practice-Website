// Loads MathLive in the browser, once. It is imported on demand because it needs the browser (custom elements),
// and its math fonts are served from /mathlive-fonts (copied from the package into public/, MIT licensed).
// Its sounds are switched off.
import type * as MathLive from "mathlive";

export type MathLiveModule = typeof MathLive;
export type { MathfieldElement } from "mathlive";

let loading: Promise<MathLiveModule> | null = null;

export function loadMathLive(): Promise<MathLiveModule> {
  loading ??= import("mathlive").then((m) => {
    m.MathfieldElement.fontsDirectory = "/mathlive-fonts";
    m.MathfieldElement.soundsDirectory = null;
    return m;
  });
  return loading;
}
