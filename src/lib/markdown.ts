import { marked } from "marked";
import DOMPurify from "dompurify";

marked.setOptions({
  gfm: true,
  breaks: false,
});

// Keep task-list checkboxes, headings ids, and basic formatting.
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
