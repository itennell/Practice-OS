import type { ReactNode } from "react";

// Aeon writes plain text with a little Markdown: paragraphs, "- " and "1. "
// lists, **bold** and `code`. This turns exactly that into React elements.
// No HTML from the model is ever rendered.

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern = /\*\*([^*]+)\*\*|`([^`]+)`/g;
  let last = 0;
  for (const m of text.matchAll(pattern)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(
      m[1] !== undefined ? (
        <strong key={`${key}-${m.index}`} className="font-semibold">
          {m[1]}
        </strong>
      ) : (
        <code key={`${key}-${m.index}`} className="rounded-md bg-[var(--hairline)] px-1 text-[0.9em]">
          {m[2]}
        </code>
      ),
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// `start` keeps a numbered list counting when a line of text splits it ("1. ... What you do: ... 2. ...").
type Block = { kind: "p"; lines: string[] } | { kind: "ul" | "ol"; items: string[]; start?: number };

export function blocks(text: string): Block[] {
  const out: Block[] = [];
  for (const raw of text.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\s*(\d+)[.)]\s+(.*)$/.exec(line);
    const last = out.at(-1);
    if (bullet || numbered) {
      const kind = bullet ? "ul" : "ol";
      const item = (bullet ? bullet[1] : numbered![2]).replace(/^#+\s*/, "");
      if (last?.kind === kind) last.items.push(item);
      else out.push(numbered ? { kind, items: [item], start: Number(numbered[1]) } : { kind, items: [item] });
    } else if (line.trim() === "") {
      if (last && !(last.kind === "p" && last.lines.length === 0)) out.push({ kind: "p", lines: [] });
    } else if (/^\s{2,}\S/.test(raw) && last && last.kind !== "p") {
      // An indented line under a list item continues it ("   Where: CAQH > Documents").
      last.items[last.items.length - 1] += `\n${line.trim()}`;
    } else if (last?.kind === "p") {
      last.lines.push(line.replace(/^#+\s*/, ""));
    } else {
      out.push({ kind: "p", lines: [line.replace(/^#+\s*/, "")] });
    }
  }
  return out.filter((b) => (b.kind === "p" ? b.lines.length > 0 : b.items.length > 0));
}

function withBreaks(text: string, key: string): ReactNode[] {
  return text.split("\n").flatMap((part, i) => (i === 0 ? inline(part, `${key}-${i}`) : [<br key={`${key}-br${i}`} />, ...inline(part, `${key}-${i}`)]));
}

export function AeonText({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-3">
      {blocks(text).map((b, i) =>
        b.kind === "p" ? (
          <p key={i}>{withBreaks(b.lines.join("\n"), `p${i}`)}</p>
        ) : b.kind === "ul" ? (
          <ul key={i} className="flex list-disc flex-col gap-1 pl-5">
            {b.items.map((item, j) => (
              <li key={j}>{withBreaks(item, `u${i}-${j}`)}</li>
            ))}
          </ul>
        ) : (
          <ol key={i} start={b.start !== 1 ? b.start : undefined} className="flex list-decimal flex-col gap-1 pl-5">
            {b.items.map((item, j) => (
              <li key={j}>{withBreaks(item, `o${i}-${j}`)}</li>
            ))}
          </ol>
        ),
      )}
    </div>
  );
}
