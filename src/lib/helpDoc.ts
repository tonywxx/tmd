// The markdown showcase opened by the Help action (and on first launch).
// Lives in its own module so appCommands.ts stays focused on command wiring.

export const HELP_FILE_NAME = "tmd_markdown_help.md";

export const HELP_MD = `# tmd — Markdown Feature Guide

This file is a living example of every Markdown feature **tmd** supports.
Edit it, watch the preview update live, and use it as a cheat sheet.

![tmd app icon](https://github.com/tonywxx/tmd/blob/main/img/app-icon.png)

> Tip: press **?** is not bound — but the **Help** button always re-opens
> this file from your home directory.

---

## Headings

# Heading 1
## Heading 2
### Heading 3
#### Heading 4
##### Heading 5
###### Heading 6

---

## Emphasis

*Italic text* and _also italic_.

**Bold text** and __also bold__.

***Bold and italic*** together.

~~Strikethrough~~ removes meaning.

Superscript: H~2~O is water, E = mc^2^ is energy.

---

## Lists

### Unordered

- First item
- Second item
  - Nested item
  - Another nested item
    - Deeply nested
- Third item

### Ordered

1. Step one
2. Step two
3. Step three

### Task lists

- [x] Write the document
- [x] Preview it live
- [ ] Share with a friend
- [ ] Profit

---

## Links & Images

[Visit the tmd project](https://github.com/tonywxx/tmd)

An autolink: <https://github.com/tonywxx/tmd>

![tmd app UI](https://github.com/tonywxx/tmd/blob/main/img/app-ui.png)

---

## Code

Inline code looks like \`const x = 42;\`.

Fenced code block with a language hint:

\`\`\`typescript
interface User {
  id: number;
  name: string;
  isActive: boolean;
}

function greet(user: User): string {
  return \`Hello, \${user.name}!\`;
}
\`\`\`

Plain fenced block:

\`\`\`
just some verbatim text
    with preserved spacing
\`\`\`

---

## Blockquotes

> This is a blockquote.
> It can span multiple lines.
>
> > Nested blockquotes are possible too.

---

## Tables

| Feature      | Supported | Notes                |
|--------------|:---------:|----------------------|
| Headings     | yes       | H1 – H6              |
| Tables       | yes       | alignment via colons |
| Task lists   | yes       | \`- [ ]\` syntax      |
| Footnotes    | yes       | see below¹           |

Left | Center | Right
:----|:------:|------:
a    |   b    |     c

---

## Horizontal Rule

Above and below are rules made with three dashes (or asterisks / underscores).

---

## Footnotes

Here is a statement with a footnote.¹

---

## Math (KaTeX)

Inline math: $E = mc^2$

Block math:

$$
\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}
$$

---

## Definition lists

Term
: The definition of the term.

Another term
: Its first definition.
: Its second definition.

---

## Keyboard keys

Press <kbd>⌘</kbd> + <kbd>S</kbd> to save.

---

## Highlight & marks

==Highlighted text== stands out.

<mark>Marked text</mark> too.

---

## HTML passthrough

<div style="padding:8px;border:1px solid #888;border-radius:6px">
  Raw HTML is rendered when supported.
</div>

---

¹ This is the footnote referenced above. Footnotes let you attach notes
without breaking the flow of the main text.

Happy writing!
`;
