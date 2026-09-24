/**
 * A very small PDF writer.
 *
 * Why hand-rolled: a village letter is a fixed-layout document — a letterhead,
 * a run of wrapped paragraphs, a signature block and a QR code. Pulling in a
 * full PDF engine (and its font embedding) for that would add megabytes and a
 * native dependency to an app that has to run on an office desktop. This writer
 * emits uncompressed PDF 1.4 using the base-14 Helvetica family, which every
 * PDF reader on earth already has.
 *
 * It is deliberately narrow: no images, no font embedding, no transparency.
 * The QR code is drawn as vector rectangles, so the output stays crisp at any
 * print resolution.
 */

const PAGE = {
  width: 595.28, // A4 portrait, in PostScript points
  height: 841.89,
  marginX: 56.7, // 20 mm
  marginTop: 56.7,
  marginBottom: 70.87, // 25 mm, leaving room for the footer
} as const;

export const CONTENT_WIDTH = PAGE.width - PAGE.marginX * 2;

/* -------------------------------------------------------------------------- */
/* Text metrics                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Helvetica glyph widths (units per 1000 em) for the ASCII range. Taken from
 * the Adobe AFM metrics for Helvetica / Helvetica-Bold. Accurate enough that
 * wrapped Indonesian legal text breaks at the same word the printed page does.
 */
const HELVETICA_WIDTHS: Record<string, number> = {
  " ": 278, "!": 278, '"': 355, "#": 556, $: 556, "%": 889, "&": 667, "'": 191,
  "(": 333, ")": 333, "*": 389, "+": 584, ",": 278, "-": 333, ".": 278, "/": 278,
  "0": 556, "1": 556, "2": 556, "3": 556, "4": 556, "5": 556, "6": 556, "7": 556,
  "8": 556, "9": 556, ":": 278, ";": 278, "<": 584, "=": 584, ">": 584, "?": 556,
  "@": 1015,
  A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500,
  K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611,
  U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  "[": 278, "\\": 278, "]": 278, "^": 469, _: 556, "`": 333,
  a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222,
  k: 500, l: 222, m: 833, n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278,
  u: 556, v: 500, w: 722, x: 500, y: 500, z: 500,
  "{": 334, "|": 260, "}": 334, "~": 584,
};

/** Helvetica-Bold differs for a handful of capitals and digits. */
const BOLD_OVERRIDES: Record<string, number> = {
  " ": 278, "!": 333, '"': 474, "#": 556, $: 556, "%": 889, "&": 722, "'": 238,
  "(": 333, ")": 333, "*": 389, "+": 584, ",": 278, "-": 333, ".": 278, "/": 278,
  "0": 556, "1": 556, "2": 556, "3": 556, "4": 556, "5": 556, "6": 556, "7": 556,
  "8": 556, "9": 556, ":": 333, ";": 333, "<": 584, "=": 584, ">": 584, "?": 611,
  "@": 975,
  A: 722, B: 722, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 556,
  K: 722, L: 611, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611,
  U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611, a: 556, b: 611, c: 556, d: 611,
  e: 556, f: 333, g: 611, h: 611, i: 278, j: 278, k: 556, l: 278, m: 889, n: 611,
  o: 611, p: 611, q: 611, r: 389, s: 556, t: 333, u: 611, v: 556, w: 778, x: 556,
  y: 556, z: 500,
};

export type FontName = "Helvetica" | "Helvetica-Bold" | "Helvetica-Oblique";

export function measureText(text: string, size: number, font: FontName = "Helvetica") {
  const table = font === "Helvetica-Bold" ? BOLD_OVERRIDES : HELVETICA_WIDTHS;
  let total = 0;
  for (const char of text) {
    total += table[char] ?? 556;
  }
  return (total * size) / 1000;
}

/** Greedy word wrap against the real Helvetica advance widths. */
export function wrapText(
  text: string,
  size: number,
  maxWidth: number,
  font: FontName = "Helvetica",
): string[] {
  const lines: string[] = [];

  for (const paragraph of text.split("\n")) {
    if (paragraph.trim() === "") {
      lines.push("");
      continue;
    }
    let current = "";
    for (const word of paragraph.split(/\s+/)) {
      const candidate = current ? `${current} ${word}` : word;
      if (measureText(candidate, size, font) <= maxWidth) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        // A single word longer than the line still has to break somewhere.
        if (measureText(word, size, font) > maxWidth) {
          let chunk = "";
          for (const char of word) {
            if (measureText(chunk + char, size, font) > maxWidth) {
              lines.push(chunk);
              chunk = char;
            } else {
              chunk += char;
            }
          }
          current = chunk;
        } else {
          current = word;
        }
      }
    }
    if (current) lines.push(current);
  }

  return lines;
}

/* -------------------------------------------------------------------------- */
/* Content streams                                                             */
/* -------------------------------------------------------------------------- */

const escapePdfText = (value: string) =>
  value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

/** Latin-1 encoding keeps Indonesian text (and most loanwords) intact. */
function encodeLatin1(value: string) {
  // Transliterate the handful of typographic characters that appear in copy.
  const normalised = value
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u00a0/g, " ")
    .replace(/\u2022/g, "-");

  let out = "";
  for (const char of normalised) {
    const code = char.codePointAt(0) ?? 63;
    out += code <= 0xff ? char : "?";
  }
  return out;
}

export class PdfPage {
  readonly ops: string[] = [];
  /** Cursor measured from the bottom-left origin. */
  cursorY = PAGE.height - PAGE.marginTop;

  get x() {
    return PAGE.marginX;
  }

  get bottom() {
    return PAGE.marginBottom;
  }

  get remaining() {
    return this.cursorY - PAGE.marginBottom;
  }

  /** Places a single line at the cursor (or an explicit x/y baseline). */
  drawText(
    value: string,
    {
      x,
      size = 10.5,
      font = "Helvetica" as FontName,
      align = "left",
      lineHeight,
      advance = true,
    }: {
      x?: number;
      size?: number;
      font?: FontName;
      align?: "left" | "center" | "right";
      lineHeight?: number;
      advance?: boolean;
    } = {},
  ) {
    const encoded = encodeLatin1(value);
    const lh = lineHeight ?? size * 1.45;
    const width = measureText(encoded, size, font);

    let px = x ?? PAGE.marginX;
    if (align === "center") px = (PAGE.width - width) / 2;
    else if (align === "right") px = PAGE.width - PAGE.marginX - width;

    const y = advance ? (this.cursorY -= lh) : this.cursorY;
    this.ops.push(
      `BT /${font} ${size} Tf 1 0 0 1 ${px.toFixed(2)} ${y.toFixed(2)} Tm (${escapePdfText(encoded)}) Tj ET`,
    );
    return this;
  }

  /** Wrapped body copy. Returns the number of lines emitted. */
  paragraph(
    value: string,
    {
      x,
      size = 10.5,
      font = "Helvetica" as FontName,
      width = CONTENT_WIDTH,
      lineHeight,
      align = "left",
    }: {
      x?: number;
      size?: number;
      font?: FontName;
      width?: number;
      lineHeight?: number;
      align?: "left" | "center";
    } = {},
  ) {
    const lines = wrapText(encodeLatin1(value), size, width, font);
    for (const line of lines) {
      this.drawText(line, { x, size, font, align, lineHeight });
    }
    return lines.length;
  }

  space(points = 8) {
    this.cursorY -= points;
    return this;
  }

  rule(y = this.cursorY, thickness = 0.7, color: [number, number, number] = [0.6, 0.64, 0.7]) {
    this.ops.push(
      `${color[0]} ${color[1]} ${color[2]} RG ${thickness} w ${PAGE.marginX} ${y.toFixed(2)} m ${(PAGE.width - PAGE.marginX).toFixed(2)} ${y.toFixed(2)} l S`,
    );
    return this;
  }

  rect(
    x: number,
    y: number,
    width: number,
    height: number,
    { fill, stroke }: { fill?: [number, number, number]; stroke?: [number, number, number] } = {},
  ) {
    if (fill) {
      this.ops.push(`${fill[0]} ${fill[1]} ${fill[2]} rg ${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re f`);
    }
    if (stroke) {
      this.ops.push(
        `${stroke[0]} ${stroke[1]} ${stroke[2]} RG 0.7 w ${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re S`,
      );
    }
    return this;
  }

  /**
   * Draws a QR symbol using the raw module matrix — pure vector, no image
   * XObject, so it stays sharp when the letter is printed at 600 dpi.
   */
  qrCode(
    matrix: { size: number; get(row: number, col: number): boolean },
    x: number,
    y: number,
    pixelSize: number,
  ) {
    const cell = pixelSize / matrix.size;
    this.ops.push(`0 0 0 rg`);
    for (let row = 0; row < matrix.size; row += 1) {
      let runStart = -1;
      for (let col = 0; col <= matrix.size; col += 1) {
        const dark = col < matrix.size && matrix.get(row, col);
        if (dark && runStart < 0) runStart = col;
        if (!dark && runStart >= 0) {
          const runWidth = col - runStart;
          const rx = x + runStart * cell;
          const ry = y + (matrix.size - 1 - row) * cell;
          this.ops.push(
            `${rx.toFixed(3)} ${ry.toFixed(3)} ${(runWidth * cell).toFixed(3)} ${cell.toFixed(3)} re f`,
          );
          runStart = -1;
        }
      }
    }
    return this;
  }
}

/* -------------------------------------------------------------------------- */
/* Document assembly                                                           */
/* -------------------------------------------------------------------------- */

export class PdfDocument {
  private readonly pages: PdfPage[] = [];

  constructor(
    readonly meta: {
      title: string;
      subject: string;
      author: string;
      creator?: string;
    },
  ) {
    this.pages.push(new PdfPage());
  }

  get page() {
    return this.pages[this.pages.length - 1];
  }

  get pageCount() {
    return this.pages.length;
  }

  addPage() {
    const page = new PdfPage();
    this.pages.push(page);
    return page;
  }

  /** Serialises the document to a Buffer ready to stream from a route handler. */
  build(): Uint8Array {
    const objects: string[] = [];
    const contentStreams = this.pages.map((page) => page.ops.join("\n"));

    // Object layout:
    //   1 catalog · 2 pages tree · 3..5 fonts
    //   6..(6+n-1) page objects · then content streams
    const fontObjectIds = { regular: 3, bold: 4, oblique: 5 } as const;
    const firstPageId = 6;
    const firstContentId = firstPageId + this.pages.length;

    objects[1] = `<< /Type /Catalog /Pages 2 0 R >>`;

    const kids = this.pages
      .map((_, index) => `${firstPageId + index} 0 R`)
      .join(" ");
    objects[2] = `<< /Type /Pages /Count ${this.pages.length} /Kids [${kids}] >>`;

    const fontObject = (baseFont: string) =>
      `<< /Type /Font /Subtype /Type1 /BaseFont /${baseFont} /Encoding /WinAnsiEncoding >>`;
    objects[fontObjectIds.regular] = fontObject("Helvetica");
    objects[fontObjectIds.bold] = fontObject("Helvetica-Bold");
    objects[fontObjectIds.oblique] = fontObject("Helvetica-Oblique");

    this.pages.forEach((_, index) => {
      objects[firstPageId + index] =
        `<< /Type /Page /Parent 2 0 R ` +
        `/MediaBox [0 0 ${PAGE.width} ${PAGE.height}] ` +
        `/Resources << /Font << /Helvetica ${fontObjectIds.regular} 0 R ` +
        `/Helvetica-Bold ${fontObjectIds.bold} 0 R ` +
        `/Helvetica-Oblique ${fontObjectIds.oblique} 0 R >> >> ` +
        `/Contents ${firstContentId + index} 0 R >>`;
    });

    contentStreams.forEach((stream, index) => {
      objects[firstContentId + index] =
        `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
    });

    const infoId = firstContentId + this.pages.length;
    const encodeInfo = (value: string) => encodeLatin1(value).replace(/[\\()]/g, (m) => `\\${m}`);
    objects[infoId] =
      `<< /Title (${encodeInfo(this.meta.title)}) ` +
      `/Subject (${encodeInfo(this.meta.subject)}) ` +
      `/Author (${encodeInfo(this.meta.author)}) ` +
      `/Creator (${encodeInfo(this.meta.creator ?? "Sistem Informasi Desa Sukamaju")}) ` +
      `/Producer (Digital Village Dashboard) ` +
      `/CreationDate (D:${formatPdfDate(new Date())}) >>`;

    // --- serialise with a cross-reference table ---------------------------
    const parts: string[] = [];
    const offsets: number[] = [];
    let position = 0;

    const push = (chunk: string) => {
      parts.push(chunk);
      position += Buffer.byteLength(chunk, "latin1");
    };

    push("%PDF-1.4\n");
    // A binary comment marker stops naive tools from mangling the file.
    push("%\u00e2\u00e3\u00cf\u00d3\n");

    for (let id = 1; id <= infoId; id += 1) {
      const body = objects[id];
      if (body === undefined) continue;
      offsets[id] = position;
      push(`${id} 0 obj\n${body}\nendobj\n`);
    }

    const xrefOffset = position;
    const maxId = infoId;
    push(`xref\n0 ${maxId + 1}\n`);
    push(`0000000000 65535 f \n`);
    for (let id = 1; id <= maxId; id += 1) {
      const offset = offsets[id] ?? 0;
      push(`${offset.toString().padStart(10, "0")} 00000 ${offset ? "n" : "f"} \n`);
    }

    push(`trailer\n<< /Size ${maxId + 1} /Root 1 0 R /Info ${infoId} 0 R >>\n`);
    push(`startxref\n${xrefOffset}\n%%EOF\n`);

    return new Uint8Array(Buffer.from(parts.join(""), "latin1"));
  }
}

function formatPdfDate(date: Date) {
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}` +
    `+07'00'`
  );
}

export { PAGE };
