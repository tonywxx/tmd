import { EditorView } from "@codemirror/view";
import { EditorSelection } from "@codemirror/state";

interface LineRange {
  from: number;
  to: number;
  text: string;
  number: number;
}

function selectedLines(view: EditorView): LineRange[] {
  const { state } = view;
  const ranges = state.selection.ranges;
  const set = new Set<number>();
  const lines: LineRange[] = [];
  for (const r of ranges) {
    let start = state.doc.lineAt(r.from).number;
    let end = state.doc.lineAt(r.to).number;
    if (r.empty && start === end) end = start;
    for (let n = start; n <= end; n++) {
      if (set.has(n)) continue;
      set.add(n);
      const line = state.doc.line(n);
      lines.push({ from: line.from, to: line.to, text: line.text, number: n });
    }
  }
  return lines;
}

function headSelection(view: EditorView): { from: number; to: number } {
  const r = view.state.selection.main;
  return { from: r.from, to: r.to };
}

function toggleInline(
  view: EditorView,
  marker: string,
  cursorOffset = 0,
): void {
  const { from, to } = headSelection(view);
  const sel = view.state.sliceDoc(from, to);
  const doc = view.state.doc;
  const before = from >= marker.length ? doc.sliceString(from - marker.length, from) : "";
  const after = to + marker.length <= doc.length ? doc.sliceString(to, to + marker.length) : "";

  if (before === marker && after === marker && sel.length > 0) {
    // unwrap
    view.dispatch({
      changes: [
        { from: from - marker.length, to: from, insert: "" },
        { from: to, to: to + marker.length, insert: "" },
      ],
      selection: EditorSelection.range(from - marker.length, to - marker.length),
    });
    return;
  }
  const text = sel.length > 0 ? sel : "";
  const insert = marker + text + marker;
  view.dispatch({
    changes: { from, to, insert },
    selection: EditorSelection.range(
      from + marker.length + cursorOffset,
      from + marker.length + text.length + cursorOffset,
    ),
  });
}

function lineHasPrefix(text: string, re: RegExp): RegExpMatchArray | null {
  return text.match(re);
}

function toggleLinePrefix(
  view: EditorView,
  prefix: string | ((n: number) => string),
  re: RegExp,
): void {
  const lines = selectedLines(view);
  if (lines.length === 0) return;
  const allHave = lines.every((l) => re.test(l.text));
  const changes: { from: number; to: number; insert: string }[] = [];
  lines.forEach((l, i) => {
    const m = l.text.match(re);
    if (allHave) {
      // remove prefix
      const len = m ? m[0].length : 0;
      changes.push({ from: l.from, to: l.from + len, insert: "" });
    } else {
      const p = typeof prefix === "function" ? prefix(i) : prefix;
      changes.push({ from: l.from, to: l.from, insert: p });
    }
  });
  view.dispatch({
    changes,
    selection: view.state.selection,
  });
}

export function applyFormatting(view: EditorView, action: string): void {
  switch (action) {
    case "bold":
      toggleInline(view, "**");
      break;
    case "italic":
      toggleInline(view, "*");
      break;
    case "strikethrough":
      toggleInline(view, "~~");
      break;
    case "code":
      toggleInline(view, "`");
      break;
    case "codeblock": {
      const { from, to } = headSelection(view);
      const sel = view.state.sliceDoc(from, to);
      const fenceStart = "```\n";
      const fenceEnd = "\n```\n";
      const wrapped = fenceStart + sel + fenceEnd;
      view.dispatch({
        changes: { from, to, insert: wrapped },
        selection: EditorSelection.range(
          from + fenceStart.length,
          from + fenceStart.length + sel.length,
        ),
      });
      break;
    }
    case "link": {
      const { from, to } = headSelection(view);
      const sel = view.state.sliceDoc(from, to);
      const insert = `[${sel}](url)`;
      view.dispatch({
        changes: { from, to, insert },
        selection: EditorSelection.range(from + sel.length + 3, from + sel.length + 6),
      });
      break;
    }
    case "heading1":
      toggleLinePrefix(view, "# ", /^(#{1,6})\s/);
      break;
    case "heading2":
      toggleLinePrefix(view, "## ", /^(#{1,6})\s/);
      break;
    case "heading3":
      toggleLinePrefix(view, "### ", /^(#{1,6})\s/);
      break;
    case "heading4":
      toggleLinePrefix(view, "#### ", /^(#{1,6})\s/);
      break;
    case "heading5":
      toggleLinePrefix(view, "##### ", /^(#{1,6})\s/);
      break;
    case "heading6":
      toggleLinePrefix(view, "###### ", /^(#{1,6})\s/);
      break;
    case "bullet-list":
      toggleLinePrefix(view, "- ", /^([-*+])\s/);
      break;
    case "numbered-list":
      toggleLinePrefix(
        view,
        (n) => `${n + 1}. `,
        /^\d+\.\s/,
      );
      break;
    case "task-list":
      toggleLinePrefix(view, "- [ ] ", /^([-*+])\s\[( |x|X)\]\s/);
      break;
    case "quote":
      toggleLinePrefix(view, "> ", /^>\s?/);
      break;
    case "hr": {
      const { from, to } = headSelection(view);
      const line = view.state.doc.lineAt(from);
      view.dispatch({
        changes: { from: line.from, to: line.to, insert: "---" },
        selection: EditorSelection.cursor(line.from + 3),
      });
      break;
    }
    default:
      break;
  }
  view.focus();
  void lineHasPrefix;
}
