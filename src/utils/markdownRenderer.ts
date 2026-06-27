/**
 * markdownRenderer.ts
 *
 * Lightweight, dependency-free Markdown → HTML renderer.
 *
 * Supported syntax:
 *   • Headings   : #, ##, ###
 *   • Bullet list: - item  |  * item
 *   • Numbered   : 1. item
 *   • Table      : | Col | Col |  (with separator row)
 *   • Bold       : **text**
 *   • Italic     : *text*
 *   • Inline code: `text`
 *
 * Design constraints:
 *   - Pure functions — no side effects, no imports.
 *   - Safe: all user content passes through inlineFormat() which
 *     HTML-escapes &, <, > before applying inline markup.
 *   - Never changes the meaning of the text.
 */

// ── Inline formatting ─────────────────────────────────────────────────────────

/**
 * Escape HTML special chars then apply bold / italic / inline-code.
 * Order matters: preserve known safe HTML tags (<br>) first, then escape
 * all other angle brackets to prevent XSS.
 */
export function inlineFormat(s: string): string {
  // Step 1: Replace <br> / <br/> with a placeholder BEFORE escaping
  const BR = "\x00BR\x00";
  let out = s.replace(/<br\s*\/?>/gi, BR);

  // Step 2: Escape remaining HTML special chars
  out = out
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Step 3: Apply markdown inline formatting
  out = out
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, '<code class="md-code">$1</code>');

  // Step 4: Restore <br> tags
  out = out.replace(new RegExp(BR, "g"), "<br>");

  return out;
}

// ── Block rendering ───────────────────────────────────────────────────────────

/**
 * Convert a raw markdown string into an HTML string.
 * Processes blocks sequentially; greedy collection for multi-line blocks
 * (tables, lists) so a single call handles the full input.
 */
export function renderMarkdown(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // ── Markdown table ─────────────────────────────────────────────────────
    if (/^\s*\|/.test(line)) {
      const tableLines: string[] = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        tableLines.push(lines[i].trim());
        i++;
      }

      if (tableLines.length >= 2) {
        const headerCells = tableLines[0]
          .replace(/^\|/, "")
          .replace(/\|$/, "")
          .split("|")
          .map((c) => c.trim());

        const colCount = headerCells.length; // authoritative column count

        // Row index 1 is the separator row — skip it.
        const dataRows = tableLines.slice(2);

        let table = `<table class="md-table"><thead><tr>`;
        for (const h of headerCells) {
          table += `<th>${inlineFormat(h)}</th>`;
        }
        table += `</tr></thead><tbody>`;

        for (const row of dataRows) {
          // Skip rows that are only pipes/dashes/spaces (stray separators)
          if (!row.replace(/[|\-\s]/g, "")) continue;

          let cells = row
            .replace(/^\|/, "")
            .replace(/\|$/, "")
            .split("|")
            .map((c) => c.trim());

          // Normalize: pad with empty cells if too short, truncate if too long
          if (cells.length < colCount) {
            cells = [...cells, ...Array(colCount - cells.length).fill("")];
          } else if (cells.length > colCount) {
            cells = cells.slice(0, colCount);
          }

          table += `<tr>`;
          for (const cell of cells) {
            table += `<td>${inlineFormat(cell)}</td>`;
          }
          table += `</tr>`;
        }

        table += `</tbody></table>`;
        out.push(table);
        continue;
      }
    }


    // ── Headings ───────────────────────────────────────────────────────────
    const h3 = line.match(/^###\s+(.+)$/);
    if (h3) {
      out.push(`<h3 class="md-h3">${inlineFormat(h3[1])}</h3>`);
      i++;
      continue;
    }
    const h2 = line.match(/^##\s+(.+)$/);
    if (h2) {
      out.push(`<h2 class="md-h2">${inlineFormat(h2[1])}</h2>`);
      i++;
      continue;
    }
    const h1 = line.match(/^#\s+(.+)$/);
    if (h1) {
      out.push(`<h1 class="md-h1">${inlineFormat(h1[1])}</h1>`);
      i++;
      continue;
    }

    // ── Bullet list ────────────────────────────────────────────────────────
    if (/^[\-\*]\s+/.test(line)) {
      let html = `<ul class="md-ul">`;
      while (i < lines.length && /^[\-\*]\s+/.test(lines[i])) {
        html += `<li>${inlineFormat(lines[i].replace(/^[\-\*]\s+/, ""))}</li>`;
        i++;
      }
      html += `</ul>`;
      out.push(html);
      continue;
    }

    // ── Numbered list ──────────────────────────────────────────────────────
    if (/^\d+\.\s+/.test(line)) {
      let html = `<ol class="md-ol">`;
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        html += `<li>${inlineFormat(lines[i].replace(/^\d+\.\s+/, ""))}</li>`;
        i++;
      }
      html += `</ol>`;
      out.push(html);
      continue;
    }

    // ── Blank line ─────────────────────────────────────────────────────────
    if (line.trim() === "") {
      out.push(`<div class="md-spacer"></div>`);
      i++;
      continue;
    }

    // ── Plain paragraph ────────────────────────────────────────────────────
    out.push(`<p class="md-p">${inlineFormat(line)}</p>`);
    i++;
  }

  return out.join("");
}

// ── CSS string ────────────────────────────────────────────────────────────────

/**
 * Scoped CSS for all md-* class names.
 * Inject this into a <style> tag once in any component that uses renderMarkdown().
 *
 * The colour variables use CSS custom properties so the table adapts
 * to both light and dark themes.
 */
export const MARKDOWN_CSS = `
  .md-table { width:100%; border-collapse:collapse; font-size:0.82rem; margin:8px 0; }
  .md-table th { background:var(--md-th-bg,#065f46); color:var(--md-th-fg,#ecfdf5); padding:8px 12px; text-align:left; font-weight:700; border:1px solid var(--md-border,#34d399); }
  .md-table td { padding:7px 12px; border:1px solid var(--md-border,#a7f3d0); color:var(--md-td-fg,#1e3a2f); vertical-align:top; }
  .md-table tr:nth-child(even) td { background:var(--md-row-even,#d1fae5); }
  .md-table tr:hover td { background:var(--md-row-hover,#a7f3d0); transition:background 0.15s; }
  .md-h1,.md-h2,.md-h3 { font-weight:700; color:var(--md-heading,#065f46); margin:8px 0 4px; }
  .md-h1 { font-size:1.1rem; }
  .md-h2 { font-size:1rem; }
  .md-h3 { font-size:0.9rem; }
  .md-ul,.md-ol { margin:4px 0 4px 1.25rem; padding:0; }
  .md-ul li,.md-ol li { margin:2px 0; font-size:0.82rem; color:var(--md-body,#1e3a2f); }
  .md-p { margin:4px 0; font-size:0.82rem; color:var(--md-body,#1e3a2f); line-height:1.6; }
  .md-spacer { height:6px; }
  .md-code { background:var(--md-code-bg,#d1fae5); padding:1px 4px; border-radius:3px; font-family:monospace; font-size:0.78rem; }
`;
