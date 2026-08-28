import { marked } from "marked";
import type { RendererObject } from "marked";
import type { Config } from "dompurify";
import DOMPurify from "dompurify";
import "./highlight-theme.css";
import { gfmHeadingId } from "marked-gfm-heading-id";
import { markedHighlight } from "marked-highlight";
import hljs from "highlight.js";
import markedFootnote from "marked-footnote";
import markedKatex from "marked-katex-extension";
import { tmdFeatures, type MarkdownFeature } from "./markdownExtensions";

marked.setOptions({
  gfm: true,
  breaks: false,
});

// The Markdown pipeline is a single registry of features. Each feature declares
// its marked extensions, an optional renderer override, and any DOMPurify tags
// it needs allowed. Building the pipeline is a reduce over the registry, so the
// full feature set is declared in one place and each feature is independently
// unit-testable from a snippet.
const features: MarkdownFeature[] = [
  // --- core GFM pipeline ---
  { name: "gfm-heading-id", extensions: [gfmHeadingId()] },
  {
    name: "syntax-highlight",
    extensions: [
      markedHighlight({
        langPrefix: "hljs language-",
        highlight(code, lang) {
          const language = hljs.getLanguage(lang) ? lang : "plaintext";
          return hljs.highlight(code, { language }).value;
        },
      }),
    ],
  },
  { name: "footnotes", extensions: [markedFootnote()] },
  {
    name: "math-katex",
    extensions: [markedKatex({ throwOnError: false, output: "mathml" })],
  },
  // --- tmd-specific syntax (defined in markdownExtensions.ts) ---
  ...tmdFeatures,
];

// Renderers from several features are merged into one object before a single
// marked.use call; later features win on method collisions.
const renderers = features
  .map((f) => f.renderer)
  .filter((r): r is RendererObject => Boolean(r));

for (const f of features) {
  f.extensions?.forEach((e) => marked.use(e));
}
if (renderers.length) {
  marked.use({ renderer: Object.assign({}, ...renderers) });
}

// Baseline allowlist for the GFM core (task-list checkboxes render as
// <input checked disabled type>). Feature-contributed tags are unioned on top,
// so removing a feature cleanly drops its allowlist entries. Kept array-only so
// the registry reduction stays simple (DOMPurify also accepts predicate fns,
// which no tmd feature needs).
type SanitizeTags = {
  ADD_TAGS: string[];
  ADD_ATTR: string[];
  FORBID_TAGS: string[];
  FORBID_ATTR?: string[];
  ALLOW_DATA_ATTR?: boolean;
};

const BASE_SANITIZE: SanitizeTags = {
  ADD_ATTR: ["target", "rel", "checked", "disabled", "type", "id"],
  ADD_TAGS: ["input"],
  FORBID_TAGS: ["style", "script"],
  ALLOW_DATA_ATTR: false,
};

const SANITIZE_CONFIG: Config = features.reduce((cfg, f) => {
  const s = f.sanitize;
  if (!s) return cfg;
  if (s.ADD_TAGS) cfg.ADD_TAGS = [...new Set([...cfg.ADD_TAGS, ...s.ADD_TAGS])];
  if (s.ADD_ATTR) cfg.ADD_ATTR = [...new Set([...cfg.ADD_ATTR, ...s.ADD_ATTR])];
  if (s.FORBID_TAGS)
    cfg.FORBID_TAGS = [...new Set([...cfg.FORBID_TAGS, ...s.FORBID_TAGS])];
  if (s.FORBID_ATTR)
    cfg.FORBID_ATTR = [...new Set([...(cfg.FORBID_ATTR ?? []), ...s.FORBID_ATTR])];
  if (s.ALLOW_DATA_ATTR !== undefined) cfg.ALLOW_DATA_ATTR = s.ALLOW_DATA_ATTR;
  return cfg;
}, structuredClone(BASE_SANITIZE));

export function renderMarkdown(src: string): string {
  const raw = marked.parse(src, { async: false }) as string;
  return DOMPurify.sanitize(raw, SANITIZE_CONFIG);
}
