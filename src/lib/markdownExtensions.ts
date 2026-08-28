import type {
  MarkedExtension,
  RendererObject,
  Token,
  TokenizerAndRendererExtension,
  Tokens,
} from "marked";

// A MarkdownFeature is the single seam that describes one renderable capability:
// its marked extensions, an optional renderer override, and any DOMPurify tags
// it needs allowed. markdown.ts folds this registry into the marked pipeline and
// the sanitize allowlist, so adding or removing a feature is one entry here.
export interface MarkdownFeature {
  name: string;
  extensions?: MarkedExtension[];
  renderer?: RendererObject;
  sanitize?: {
    ADD_TAGS?: string[];
    ADD_ATTR?: string[];
    FORBID_TAGS?: string[];
    FORBID_ATTR?: string[];
    ALLOW_DATA_ATTR?: boolean;
  };
}

// Self-contained marked extensions so tmd renders the GitHub-flavored and
// Markdown-Extra features promised in the Help guide (src/lib/helpDoc.ts):
//   - superscript  ^x^   / subscript ~x~   (marked-gfm has no sub/sup)
//   - highlight    ==x==  (GFM "marked text", not in marked core)
//   - definition lists  Term\n: def        (Markdown Extra)
//   - GitHub alerts       > [!NOTE] …       (GitHub-style admonitions)
// Every emitted tag (sup/sub/dl/dt/dd, mark, div+p with class) is already in
// DOMPurify's default allowlist, so none of these declare a sanitize change.

type AlertType = "NOTE" | "TIP" | "IMPORTANT" | "WARNING" | "CAUTION";

const ALERT_TITLE: Record<AlertType, string> = {
  NOTE: "Note",
  TIP: "Tip",
  IMPORTANT: "Important",
  WARNING: "Warning",
  CAUTION: "Caution",
};

const supSubExtensions: TokenizerAndRendererExtension[] = [
  {
    name: "superscript",
    level: "inline",
    start(src) {
      return src.indexOf("^");
    },
    tokenizer(src) {
      const m = /^\^([^\s^][^^]*?)\^/.exec(src);
      if (!m) return;
      const token = {
        type: "superscript",
        raw: m[0],
        text: m[1],
        tokens: [] as Token[],
      };
      this.lexer.inline(token.text, token.tokens);
      return token as Tokens.Generic;
    },
    renderer(token) {
      const t = token as unknown as { tokens: Token[] };
      return `<sup>${this.parser.parseInline(t.tokens)}</sup>`;
    },
  },
  {
    name: "subscript",
    level: "inline",
    start(src) {
      return src.indexOf("~");
    },
    tokenizer(src) {
      // Leave ~~…~~ (GFM strikethrough) to marked-gfm.
      if (src.startsWith("~~")) return;
      const m = /^~([^\s~][^~]*?)~/.exec(src);
      if (!m) return;
      const token = {
        type: "subscript",
        raw: m[0],
        text: m[1],
        tokens: [] as Token[],
      };
      this.lexer.inline(token.text, token.tokens);
      return token as Tokens.Generic;
    },
    renderer(token) {
      const t = token as unknown as { tokens: Token[] };
      return `<sub>${this.parser.parseInline(t.tokens)}</sub>`;
    },
  },
];

const highlightExtensions: TokenizerAndRendererExtension[] = [
  {
    name: "highlight",
    level: "inline",
    start(src) {
      return src.indexOf("==");
    },
    tokenizer(src) {
      // No space immediately inside the markers, so prose like "a == b" and
      // equality expressions are left untouched.
      const m = /^==(\S(?:[^=\n]*?\S)?)==/.exec(src);
      if (!m) return;
      const token = {
        type: "highlight",
        raw: m[0],
        text: m[1],
        tokens: [] as Token[],
      };
      this.lexer.inline(token.text, token.tokens);
      return token as Tokens.Generic;
    },
    renderer(token) {
      const t = token as unknown as { tokens: Token[] };
      return `<mark>${this.parser.parseInline(t.tokens)}</mark>`;
    },
  },
];

const definitionListExtensions: TokenizerAndRendererExtension[] = [
  {
    name: "definitionList",
    level: "block",
    start(src) {
      const m = /^[^\n:].*\n:/.exec(src);
      return m ? m.index : undefined;
    },
    tokenizer(src) {
      const m = /^([^\n:][^\n]*)\n((?::[^\n]*\n?)+)/.exec(src);
      if (!m) return;
      const term = m[1].trim();
      const defs = m[2]
        .split("\n")
        .filter((l) => l.startsWith(":"))
        .map((l) => l.slice(1).trim());
      const token = {
        type: "definitionList",
        raw: m[0],
        term,
        defs,
        termTokens: [] as Token[],
        defsTokens: [] as Token[][],
      };
      token.termTokens = this.lexer.inline(term);
      token.defsTokens = defs.map((d) => this.lexer.inline(d));
      return token as Tokens.Generic;
    },
    renderer(token) {
      const t = token as unknown as {
        termTokens: Token[];
        defsTokens: Token[][];
      };
      const dt = this.parser.parseInline(t.termTokens);
      const dds = t.defsTokens
        .map((d) => `<dd>${this.parser.parseInline(d)}</dd>`)
        .join("");
      return `<dl><dt>${dt}</dt>${dds}</dl>\n`;
    },
  },
];

// GitHub-style alerts are blockquotes whose first line is `[!TYPE]`. We override
// the blockquote renderer rather than add a block tokenizer, because the alert
// body is an ordinary blockquote and we only need to re-skin the wrapper.
const alertRenderer: RendererObject = {
  blockquote(token) {
    const inner = this.parser.parse(token.tokens);
    const m =
      /^\s*<p>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]([\s\S]*?)<\/p>/i.exec(
        inner
      );
    if (!m) return `<blockquote>\n${inner}</blockquote>\n`;
    const type = m[1].toUpperCase() as AlertType;
    const tail = m[2];
    let body = inner.replace(m[0], "");
    if (tail.trim()) body = `<p>${tail.trim()}</p>${body}`;
    return (
      `<div class="markdown-alert markdown-alert-${type.toLowerCase()}">` +
      `<p class="markdown-alert-title">${ALERT_TITLE[type]}</p>` +
      body +
      `</div>\n`
    );
  },
};

// tmd-specific syntax features, one entry each so the registry in markdown.ts
// stays declarative. Sanitize contributions are empty: all tags above are in
// DOMPurify's default allowlist. Custom inline/block tokenizers are wrapped in a
// MarkedExtension so the registry holds one uniform shape.
export const tmdFeatures: MarkdownFeature[] = [
  { name: "superscript-subscript", extensions: [{ extensions: supSubExtensions }] },
  { name: "highlight", extensions: [{ extensions: highlightExtensions }] },
  { name: "definition-list", extensions: [{ extensions: definitionListExtensions }] },
  { name: "alerts", renderer: alertRenderer },
];
