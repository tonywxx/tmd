import { marked } from "marked";
import type { RendererObject, Token } from "marked";
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
  ADD_ATTR: ["target", "rel", "checked", "disabled", "type", "id", "data-line"],
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

// Block renderers that produce a top-level element. When `lineMarkers` is set,
// each rendered block is stamped with a data-line attribute (the 1-based source
// line its token starts at), so the editor↔preview scroll sync can map a source
// line to a preview position even when a block — an image, code fence, table —
// renders to a very different height than its source lines.
const BLOCK_RENDERER_METHODS = [
  "space",
  "code",
  "blockquote",
  "html",
  "heading",
  "hr",
  "list",
  "paragraph",
  "table",
] as const;

// 1-based source line each top-level token starts at, accumulated from raw
// lengths (tokens do not carry their own line numbers).
function tokenLineMap(tokens: Token[]): Map<Token, number> {
  const map = new Map<Token, number>();
  let line = 1;
  for (const t of tokens) {
    map.set(t, line);
    line += (t.raw.match(/\n/g) ?? []).length;
  }
  return map;
}

// Stamp data-line onto the first opening tag of a rendered block.
function injectLineMarker(html: string, line: number | undefined): string {
  if (line == null) return html;
  const m = /^<([a-zA-Z][a-zA-Z0-9]*)(\s[^>]*)?>/.exec(html);
  if (!m) return html;
  return `<${m[1]} data-line="${line}"${m[2] ?? ""}>${html.slice(m[0].length)}`;
}

export function renderMarkdown(src: string, lineMarkers = false): string {
  if (!lineMarkers) {
    const raw = marked.parse(src, { async: false }) as string;
    return DOMPurify.sanitize(raw, SANITIZE_CONFIG);
  }

  // Mirror marked.parse's synchronous pipeline (preprocess → lex →
  // processAllTokens → walkTokens → parse → postprocess) so the renderer sees
  // the exact tokens it renders and can stamp each block with its source line.
  // Verified byte-identical to marked.parse for the same input, apart from the
  // injected data-line attributes. Opt-in so HTML export keeps its clean output.
  const options = { ...marked.defaults, async: false };
  const hooks = options.hooks;
  let text = hooks ? hooks.preprocess(src) : src;
  const tokens = (hooks ? hooks.provideLexer(true) : marked.lexer)(
    text,
    options,
  );
  const processed = hooks ? hooks.processAllTokens(tokens) : tokens;
  if (options.walkTokens) marked.walkTokens(processed, options.walkTokens);

  const lines = tokenLineMap(processed);

  const base = options.renderer ?? new marked.Renderer(options);
  const renderer = Object.create(Object.getPrototypeOf(base)) as typeof base;
  Object.assign(renderer, base);
  const wrapped = renderer as unknown as Record<
    string,
    (this: unknown, token: Token) => string
  >;
  for (const name of BLOCK_RENDERER_METHODS) {
    const orig = wrapped[name];
    if (typeof orig === "function") {
      wrapped[name] = function (this: unknown, token: Token) {
        return injectLineMarker(orig.call(this, token), lines.get(token));
      };
    }
  }

  const parser = new marked.Parser({ ...options, renderer });
  // Feature renderers chain onto the shared renderer instance and read
  // this.parser from it; the Parser only sets parser on the wrapper above.
  if (options.renderer) options.renderer.parser = parser;
  let html = parser.parse(processed);
  if (hooks) html = hooks.postprocess(html);
  return DOMPurify.sanitize(html, SANITIZE_CONFIG);
}
