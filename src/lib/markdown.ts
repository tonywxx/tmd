import { marked } from "marked";
import DOMPurify from "dompurify";
import "./highlight-theme.css";
import { gfmHeadingId } from "marked-gfm-heading-id";
import { markedHighlight } from "marked-highlight";
import hljs from "highlight.js";
import markedFootnote from "marked-footnote";

marked.setOptions({
  gfm: true,
  breaks: false,
});

// GitHub-style `id` slugs on headings so in-document anchors (TOC links) work.
marked.use(gfmHeadingId());

// Syntax highlighting for fenced code blocks. Unknown languages fall back to
// plaintext instead of throwing, so a typo'd fence never breaks the render.
marked.use(
  markedHighlight({
    langPrefix: "hljs language-",
    highlight(code, lang) {
      const language = hljs.getLanguage(lang) ? lang : "plaintext";
      return hljs.highlight(code, { language }).value;
    },
  })
);

// GFM footnotes: `[^1]` references and `[^1]:` definitions.
marked.use(markedFootnote());

// Keep task-list checkboxes, heading ids, and basic formatting.
const SANITIZE_CONFIG = {
  ADD_ATTR: ["target", "rel", "checked", "disabled", "type", "id"],
  ADD_TAGS: ["input"],
  FORBID_TAGS: ["style", "script"],
  ALLOW_DATA_ATTR: false,
};

export function renderMarkdown(src: string): string {
  const raw = marked.parse(src, { async: false }) as string;
  return DOMPurify.sanitize(raw, SANITIZE_CONFIG);
}
