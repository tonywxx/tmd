import type { TextTransform } from "./types";

// Mathematical alphanumeric unicode maps.

// Explicit italic map (lowercase + uppercase distinct ranges; uppercase has a
// gap at 'D' which maps to 0x1d454).
const ITALIC_MAP: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (let i = 0; i < 26; i++) {
    const lower = String.fromCharCode(0x61 + i);
    const upper = String.fromCharCode(0x41 + i);
    m[lower] = String.fromCodePoint(0x1d44e + i);
    const upperCode = i < 3 ? 0x1d434 + i : i === 3 ? 0x1d454 : 0x1d434 + i + 1;
    m[upper] = String.fromCodePoint(upperCode);
  }
  return m;
})();

const BOLD_MAP: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (let i = 0; i < 26; i++) {
    m[String.fromCharCode(0x61 + i)] = String.fromCodePoint(0x1d41a + i);
    m[String.fromCharCode(0x41 + i)] = String.fromCodePoint(0x1d400 + i);
  }
  return m;
})();

const BOLD_ITALIC_MAP: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (let i = 0; i < 26; i++) {
    m[String.fromCharCode(0x61 + i)] = String.fromCodePoint(0x1d482 + i);
    const upperCode = i < 3 ? 0x1d468 + i : i === 3 ? 0x1d479 : 0x1d468 + i + 1;
    m[String.fromCharCode(0x41 + i)] = String.fromCodePoint(upperCode);
  }
  return m;
})();

const MONO_MAP: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (let i = 0; i < 26; i++) {
    m[String.fromCharCode(0x61 + i)] = String.fromCodePoint(0x1d68a + i);
    m[String.fromCharCode(0x41 + i)] = String.fromCodePoint(0x1d670 + i);
  }
  return m;
})();

const SMALL_CAPS_MAP: Record<string, string> = {
  a: "ᴀ", b: "ʙ", c: "ᴄ", d: "ᴅ", e: "ᴇ", f: "ꜰ", g: "ɢ", h: "ʜ", i: "ɪ",
  j: "ᴊ", k: "ᴋ", l: "ʟ", m: "ᴍ", n: "ɴ", o: "ᴏ", p: "ᴘ", q: "Q", r: "ʀ",
  s: "ꜱ", t: "ᴛ", u: "ᴜ", v: "ᴠ", w: "ᴡ", x: "x", y: "ʏ", z: "ᴢ",
};

const STRIKE_MAP: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  const comb = "̶";
  for (let i = 0; i < 26; i++) {
    m[String.fromCharCode(0x61 + i)] = String.fromCharCode(0x61 + i) + comb;
    m[String.fromCharCode(0x41 + i)] = String.fromCharCode(0x41 + i) + comb;
  }
  return m;
})();

function mapChars(s: string, map: Record<string, string>): string {
  let out = "";
  for (const ch of s) out += map[ch] ?? ch;
  return out;
}

export function applyTextTransform(
  transform: TextTransform,
  text: string,
): string {
  switch (transform) {
    case "unicode-italic":
      return mapChars(text, ITALIC_MAP);
    case "unicode-bold":
      return mapChars(text, BOLD_MAP);
    case "unicode-bold-italic":
      return mapChars(text, BOLD_ITALIC_MAP);
    case "unicode-monospace":
      return mapChars(text, MONO_MAP);
    case "small-caps":
      return mapChars(text, SMALL_CAPS_MAP);
    case "strikethrough":
      return mapChars(text, STRIKE_MAP);
    case "uppercase":
      return text.toUpperCase();
    case "lowercase":
      return text.toLowerCase();
    case "title-case":
      return titleCase(text);
    default:
      return text;
  }
}

export function titleCase(s: string): string {
  return s.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1));
}
