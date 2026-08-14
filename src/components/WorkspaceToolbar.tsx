import type { ReactNode } from "react";
import { HelpCircle, Link, ListChecks, Quote, Settings } from "lucide-react";
import { Icon } from "./Icon";
import { useStore } from "../lib/store";
import { executeCommand } from "../lib/commands";
import { getActiveEditorPort } from "../lib/editorPort";
import type { ViewMode } from "../lib/types";

const FORMAT_BUTTONS: { action: string; label: ReactNode; title: string }[] = [
  { action: "bold", label: "B", title: "Bold (⌘B)" },
  { action: "italic", label: "I", title: "Italic (⌘I)" },
  { action: "strikethrough", label: "S̶", title: "Strikethrough" },
  { action: "code", label: "</>", title: "Inline Code" },
  { action: "codeblock", label: "{ }", title: "Code Block" },
  { action: "link", label: <Icon icon={Link} />, title: "Link" },
  { action: "heading1", label: "H1", title: "Heading 1" },
  { action: "heading2", label: "H2", title: "Heading 2" },
  { action: "heading3", label: "H3", title: "Heading 3" },
  { action: "bullet-list", label: "•", title: "Bullet List" },
  { action: "numbered-list", label: "1.", title: "Numbered List" },
  { action: "task-list", label: <Icon icon={ListChecks} />, title: "Task List" },
  { action: "quote", label: <Icon icon={Quote} />, title: "Quote" },
  { action: "hr", label: "―", title: "Horizontal Rule" },
];

// Single-select view options. `focus` is not a ViewMode (it is the focusMode
// boolean); presenting it alongside code/split/preview as one radio group makes
// the exclusivity explicit — exactly one of the four is ever active.
type ViewOption = ViewMode | "focus";

const VIEW_OPTIONS: { value: ViewOption; label: string; title: string }[] = [
  { value: "code", label: "Code", title: "Code only" },
  { value: "split", label: "Split", title: "Code + Preview" },
  { value: "preview", label: "Preview", title: "Preview only" },
  { value: "focus", label: "Focus", title: "Focus mode (⌘⇧F)" },
];

// Unified toolbar shown directly under the tab bar, replacing the per-pane
// FormatBar (editor) and PreviewToolbar (preview). The view options form a
// single radio group pinned to the right.
export default function WorkspaceToolbar() {
  const viewMode = useStore((s) => s.viewMode);
  const setViewMode = useStore((s) => s.setViewMode);
  const focusMode = useStore((s) => s.focusMode);
  const setFocusMode = useStore((s) => s.setFocusMode);

  const selected: ViewOption = focusMode ? "focus" : viewMode;

  const selectView = (value: ViewOption) => {
    if (value === "focus") {
      setFocusMode(true);
    } else {
      setFocusMode(false);
      setViewMode(value);
    }
  };

  const fmt = (action: string) => {
    getActiveEditorPort()?.applyFormatting(action);
  };

  return (
    <div className="format-bar workspace-toolbar" data-tauri-drag-region="deep">
      <div className="tb-group format-group">
        {FORMAT_BUTTONS.map((b) => (
          <button key={b.action} className="tb-btn" title={b.title} onClick={() => fmt(b.action)}>
            {b.label}
          </button>
        ))}
      </div>

      <div className="tb-spacer" />

      <div className="tb-group" role="radiogroup" aria-label="View mode">
        {VIEW_OPTIONS.map((v) => (
          <button
            key={v.value}
            role="radio"
            aria-checked={selected === v.value}
            className={"tb-btn" + (selected === v.value ? " active" : "")}
            title={v.title}
            onClick={() => selectView(v.value)}
          >
            {v.label}
          </button>
        ))}
      </div>

      <div className="tb-group">
        <button className="tb-btn" title="Markdown Help" onClick={() => void executeCommand("help")}>
          <Icon icon={HelpCircle} />
        </button>
        <button className="tb-btn" title="Settings" onClick={() => void executeCommand("settings")}>
          <Icon icon={Settings} />
        </button>
      </div>
    </div>
  );
}
