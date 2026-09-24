/**
 * Renders a village letter request as an official Indonesian government
 * document: letterhead, opening clause, applicant table, signature block and a
 * verification QR code.
 *
 * Layout follows the format used by desa offices under Permendagri 73/2020 —
 * A4 portrait, 20 mm margins, Helvetica, double rule under the letterhead.
 */
import QRCode from "qrcode";

import {
  CONTENT_WIDTH,
  PAGE,
  PdfDocument,
  measureText,
  wrapText,
  type FontName,
  type PdfPage,
} from "./document";
import { formatLongDate, formatNumber } from "@/lib/format";

export type LetterRenderInput = {
  mode: "draft" | "copies";
  copies: number;
  verificationUrl: string;
  village: {
    name: string;
    district: string;
    regency: string;
    province: string;
    officeAddress: string;
    officePhone: string;
    officeEmail: string;
    website: string | null;
    headName: string;
    headNipd: string | null;
    villageCode: string;
  };
  request: {
    ticket: string;
    agendaNumber: number | null;
    verificationCode: string;
    submittedAt: string;
    purpose: string;
    templateTitle: string;
    letterName: string;
    letterCode: string;
    feeIdr: number;
  };
  applicant: {
    fullName: string;
    nik: string;
    birthPlace: string | null;
    birthDate: string | null;
    gender: string | null;
    religion: string | null;
    maritalStatus: string | null;
    occupation: string | null;
    nationality: string | null;
    address: string;
    familyRelation: string | null;
    kkNumber: string | null;
    familyHead: string | null;
  };
  location: { dusun: string; rt: number; rw: number };
  payload: Record<string, string | number | null>;
  signed: { signedAt: string; certificateSerial: string | null; signerName: string } | null;
};

const MARITAL: Record<string, string> = {
  BELUM_MENIKAH: "Belum Menikah",
  KAWIN: "Kawin",
  CERAI_HIDUP: "Cerai Hidup",
  CERAI_MATI: "Cerai Mati",
};

const RELIGION: Record<string, string> = {
  ISLAM: "Islam",
  KRISTEN: "Kristen",
  KATOLIK: "Katolik",
  HINDU: "Hindu",
  BUDDHA: "Buddha",
  KONGHUCU: "Konghucu",
  LAINNYA: "Lainnya",
};

const pad = (value: number) => String(value).padStart(2, "0");

/* -------------------------------------------------------------------------- */
/* Body clauses                                                                */
/* -------------------------------------------------------------------------- */

function bodyClause(code: string, input: LetterRenderInput): string {
  const { fullName, nik } = input.applicant;
  const purpose = input.request.purpose.replace(/\.$/, "").toLowerCase();
  const opening =
    `Yang bertanda tangan di bawah ini Kepala ${input.village.name}, ${input.village.district}, ` +
    `${input.village.regency}, dengan ini menerangkan bahwa:`;

  const clauses: Record<string, string> = {
    SKU:
      `Bahwa ${fullName}, NIK ${nik}, benar-benar bertempat tinggal pada alamat tersebut di atas dan ` +
      `menjalankan usaha di wilayah ${input.village.name}. Usaha dimaksud bersifat perorangan, aktif ` +
      `beroperasi, dan tidak sedang berada dalam sengketa dengan pihak lain. ` +
      `Surat keterangan ini dibuat untuk keperluan ${purpose}.`,
    SKCK:
      `Sepanjang pengetahuan kami dan berdasarkan catatan pemerintah desa, yang bersangkutan berkelakuan ` +
      `baik, tidak sedang menjalani hukuman pidana, serta tidak tercatat dalam daftar pemantauan desa. ` +
      `Surat pengantar ini dipergunakan untuk keperluan penerbitan Surat Keterangan Catatan Kepolisian ` +
      `(SKCK) pada Kepolisian Resor ${input.village.regency}.`,
    SKD:
      `Bahwa yang bersangkutan benar-benar berdomisili dan bertempat tinggal tetap di wilayah ` +
      `administratif ${input.village.name}, ${input.village.district}, ${input.village.regency}, ` +
      `sebagaimana tercatat pada Kartu Keluarga dan Kartu Tanda Penduduk yang bersangkutan. ` +
      `Surat keterangan ini dibuat untuk keperluan ${purpose}.`,
    SKM:
      `Berdasarkan laporan keluarga dan pengurus RT/RW setempat, seorang warga yang tercatat dalam ` +
      `register kependudukan desa telah meninggal dunia dengan data sebagaimana tercantum pada tabel ` +
      `berikut. Keterangan ini dipergunakan untuk kelengkapan pengurusan akta kematian pada Dinas ` +
      `Kependudukan dan Pencatatan Sipil ${input.village.regency}.`,
    SKTM:
      `Berdasarkan hasil peninjauan lapangan oleh pengurus RT/RW serta data sosial ekonomi desa, ` +
      `keluarga yang bersangkutan tergolong keluarga dengan kemampuan ekonomi terbatas dan termasuk ` +
      `dalam kategori sasaran program bantuan sosial. Surat keterangan ini dibuat untuk keperluan ${purpose}.`,
    SKL:
      `Telah lahir seorang anak warga ${input.village.name} dengan data sebagaimana tercantum pada tabel ` +
      `berikut. Kelahiran tersebut belum dicatatkan pada akta kelahiran. Surat keterangan ini dibuat ` +
      `untuk keperluan penerbitan akta kelahiran pada Dinas Kependudukan dan Pencatatan Sipil ` +
      `${input.village.regency}.`,
    SKP:
      `Bahwa yang bersangkutan beserta anggota keluarganya bermaksud pindah domisili keluar dari ` +
      `wilayah ${input.village.name}. Tidak terdapat tanggungan administrasi maupun kewajiban lain ` +
      `yang belum diselesaikan pada pemerintah desa. Surat keterangan ini dibuat untuk keperluan ${purpose}.`,
    IZN:
      `Pemerintah ${input.village.name} tidak keberatan atas permohonan izin penyelenggaraan kegiatan ` +
      `sebagaimana diuraikan pada tabel berikut. Kegiatan wajib dilaksanakan dengan tetap memperhatikan ` +
      `ketertiban umum dan keamanan lingkungan, serta dikoordinasikan dengan pengurus RT/RW dan ` +
      `Kepolisian Sektor setempat.`,
    SKT:
      `Bahwa yang bersangkutan benar-benar menguasai dan menggarap bidang tanah yang terletak di ` +
      `wilayah ${input.village.name}, sebagaimana tercatat dalam Buku Letter C Desa. Keterangan ini ` +
      `dibuat berdasarkan pengakuan yang bersangkutan, dikuatkan oleh keterangan pengurus RT/RW dan ` +
      `tetangga berbatasan, serta bukti pembayaran Pajak Bumi dan Bangunan. ` +
      `Surat keterangan ini dipergunakan untuk keperluan ${purpose}.`,
    SKN:
      `Bahwa yang bersangkutan sampai dengan tanggal dikeluarkannya surat keterangan ini berstatus ` +
      `belum menikah dan tidak pernah tercatat sebagai suami maupun istri pada register desa. ` +
      `Surat keterangan ini dibuat untuk keperluan ${purpose}.`,
    SKB:
      `Bahwa terdapat perbedaan penulisan nama pada dokumen kependudukan yang bersangkutan sebagaimana ` +
      `diuraikan pada tabel berikut. Kedua penulisan nama tersebut merujuk pada satu orang yang sama, ` +
      `yaitu ${fullName} dengan NIK ${nik}. Surat keterangan ini dibuat untuk keperluan ${purpose}.`,
  };

  const body =
    clauses[code] ??
    `Bahwa yang bersangkutan benar-benar warga ${input.village.name} dan keterangan yang tercantum ` +
      `pada surat ini sesuai dengan data kependudukan desa. Surat keterangan ini dibuat untuk ` +
      `keperluan ${purpose}.`;

  // The closing line is drawn separately, after the applicant table.
  return `${opening}\n\n${body}`;
}

/* -------------------------------------------------------------------------- */
/* Applicant table                                                             */
/* -------------------------------------------------------------------------- */

function applicantFields(input: LetterRenderInput): [string, string][] {
  const a = input.applicant;

  const birth = [a.birthPlace, a.birthDate ? formatLongDate(a.birthDate) : null]
    .filter(Boolean)
    .join(", ");

  const rows: [string, string][] = [
    ["Nama Lengkap", a.fullName.toUpperCase()],
    ["NIK", a.nik],
    ["Tempat / Tanggal Lahir", birth || "—"],
    ["Jenis Kelamin", a.gender === "L" ? "Laki-laki" : a.gender === "P" ? "Perempuan" : "—"],
    ["Agama", a.religion ? (RELIGION[a.religion] ?? a.religion) : "—"],
    ["Status Perkawinan", a.maritalStatus ? (MARITAL[a.maritalStatus] ?? a.maritalStatus) : "—"],
    ["Pekerjaan", a.occupation ?? "—"],
    ["Kewarganegaraan", a.nationality ?? "WNI"],
    ["Alamat", a.address],
    [
      "Dusun / RT / RW",
      `${input.location.dusun} · RT ${pad(input.location.rt)}/RW ${pad(input.location.rw)}`,
    ],
  ];

  if (a.kkNumber) rows.push(["Nomor Kartu Keluarga", a.kkNumber]);
  if (a.familyHead) rows.push(["Kepala Keluarga", a.familyHead]);
  if (a.familyRelation) rows.push(["Kedudukan Keluarga", a.familyRelation]);

  // Letter-specific fields carried in the request payload.
  const extra = input.payload ?? {};
  if (typeof extra.usaha === "string" && extra.usaha) rows.push(["Nama / Jenis Usaha", extra.usaha]);
  if (typeof extra.lamaDomisili === "string") rows.push(["Lama Berdomisili", extra.lamaDomisili]);
  if (typeof extra.acara === "string" && extra.acara) rows.push(["Nama Kegiatan", extra.acara]);

  return rows;
}

/* -------------------------------------------------------------------------- */
/* Page painter                                                                */
/* -------------------------------------------------------------------------- */

/**
 * The `qrcode` typings declare `BitMatrix.get` as returning a number, while the
 * runtime returns `1`/`0`. Normalise to a boolean here so the PDF writer deals
 * in one representation.
 */
type QrMatrix = { size: number; get(row: number, col: number): boolean };

/** Writes a line at an absolute x/baseline without disturbing the cursor. */
function lineAt(
  page: PdfPage,
  x: number,
  baseline: number,
  text: string,
  size: number,
  font: FontName = "Helvetica",
) {
  const saved = page.cursorY;
  page.cursorY = baseline;
  page.drawText(text, { x, size, font, advance: false });
  page.cursorY = saved;
}

function drawCopy(
  page: PdfPage,
  input: LetterRenderInput,
  ctx: { qrMatrix: QrMatrix; copyIndex: number; totalCopies: number },
) {
  const { village, request } = input;

  /* ------------------------------------------------------ draft watermark */
  if (input.mode === "draft") {
    page.ops.push(
      `q BT /Helvetica-Bold 46 Tf 0.90 0.92 0.95 rg 0.7071 0.7071 -0.7071 0.7071 96 300 Tm ` +
        `(DRAF - BELUM DITANDATANGANI) Tj ET Q 0 0 0 rg`,
    );
  }

  /* ----------------------------------------------------------- letterhead */
  const sealX = PAGE.marginX;
  const sealTop = PAGE.height - 34;
  const sealSize = 56;

  page.rect(sealX, sealTop - sealSize, sealSize, sealSize, { stroke: [0.78, 0.82, 0.87] });
  lineAt(page, sealX + 8, sealTop - 26, "LAMBANG", 6, "Helvetica");
  lineAt(page, sealX + 8, sealTop - 36, "DESA", 6, "Helvetica");
  lineAt(page, sealX + 8, sealTop - 46, "(SAMPEL)", 6, "Helvetica");

  const headX = sealX + 68;
  const headTop = sealTop - 4;

  lineAt(page, headX, headTop, `PEMERINTAH ${village.regency.toUpperCase()}`, 10.5, "Helvetica-Bold");
  lineAt(
    page,
    headX,
    headTop - 13,
    `KECAMATAN ${village.district.replace(/^Kecamatan\s+/i, "").toUpperCase()}`,
    10.5,
    "Helvetica-Bold",
  );
  lineAt(page, headX, headTop - 30, village.name.toUpperCase(), 15, "Helvetica-Bold");
  lineAt(page, headX, headTop - 42, village.officeAddress, 7.4, "Helvetica");
  lineAt(
    page,
    headX,
    headTop - 51,
    `Telp. ${village.officePhone}  ·  ${village.officeEmail}${village.website ? `  ·  ${village.website}` : ""}`,
    7.4,
    "Helvetica",
  );

  const ruleY = PAGE.height - 100;
  page.rule(ruleY, 1, [0.15, 0.2, 0.32]);
  page.rule(ruleY - 2.6, 0.35, [0.15, 0.2, 0.32]);

  let y = ruleY - 2.6;

  /* -------------------------------------------------------- title + number */
  y -= 22;
  centerLine(page, y, request.templateTitle, 12.5, "Helvetica-Bold");

  y -= 15;
  const docNumber = `Nomor: ${request.ticket}/DS/${new Date(request.submittedAt).getFullYear()}`;
  centerLine(page, y, docNumber, 10, "Helvetica");

  /* ----------------------------------------------------------------- body */
  y -= 14;
  page.cursorY = y;
  page.paragraph(bodyClause(request.letterCode, input), { size: 10.5, lineHeight: 15.4 });
  y = page.cursorY - 6;

  /* ------------------------------------------------------ applicant table */
  const labelWidth = 150;
  const valueX = PAGE.marginX + labelWidth;
  const valueWidth = CONTENT_WIDTH - labelWidth;

  for (const [label, value] of applicantFields(input)) {
    const lines = wrapText(value, 10, valueWidth, "Helvetica-Bold");
    const rowHeight = Math.max(15.5, lines.length * 12.8 + 4.6);

    y -= rowHeight;

    // Hairline separator keeps the block scannable without box-drawing.
    page.ops.push(
      `0.88 0.9 0.93 RG 0.5 w ${PAGE.marginX} ${(y + 4).toFixed(2)} m ` +
        `${(PAGE.width - PAGE.marginX).toFixed(2)} ${(y + 4).toFixed(2)} l S`,
    );

    lineAt(page, PAGE.marginX, y + 2, label, 10, "Helvetica");
    lines.forEach((text, index) => {
      lineAt(page, valueX, y + 2 - index * 12.8, text, 10, "Helvetica-Bold");
    });
  }

  /* -------------------------------------------------------- closing line */
  y -= 20;
  lineAt(page, PAGE.marginX, y, "Demikian surat keterangan ini dibuat dengan sebenarnya", 10.5, "Helvetica");
  y -= 14;
  lineAt(page, PAGE.marginX, y, "untuk dapat dipergunakan sebagaimana mestinya.", 10.5, "Helvetica");

  /* ------------------------------------------------------------- signature */
  const signColX = PAGE.width - PAGE.marginX - 196;
  let signY = y - 26;

  lineAt(
    page,
    signColX,
    signY,
    `${village.name.replace(/^Desa\s+/i, "")}, ${formatLongDate(request.submittedAt)}`,
    10,
    "Helvetica",
  );
  signY -= 13;
  lineAt(page, signColX, signY, `Kepala ${village.name}`, 10, "Helvetica");
  signY -= 10;

  if (input.signed) {
    const boxHeight = 42;
    page.rect(signColX, signY - boxHeight, 186, boxHeight, { stroke: [0.62, 0.67, 0.74] });
    lineAt(page, signColX + 6, signY - 13, "Ditandatangani secara elektronik", 7.2, "Helvetica-Oblique");
    lineAt(
      page,
      signColX + 6,
      signY - 23,
      `BSrE · ${input.signed.certificateSerial ?? "tersertifikasi"}`,
      7.2,
    );
    lineAt(page, signColX + 6, signY - 33, `Sah per ${formatLongDate(input.signed.signedAt)}`, 7.2);
    signY -= boxHeight + 14;
  } else {
    signY -= 54;
  }

  lineAt(page, signColX, signY, input.signed?.signerName ?? village.headName, 10.5, "Helvetica-Bold");
  if (village.headNipd) {
    lineAt(page, signColX, signY - 12, `NIPD. ${village.headNipd}`, 9.5);
  }

  /* ---------------------------------------------------------- QR + footer */
  const qrSize = 70;
  const qrX = PAGE.marginX;
  const qrY = page.bottom - 4;

  page.qrCode(ctx.qrMatrix, qrX, qrY, qrSize);

  const noteX = qrX + qrSize + 12;
  lineAt(page, noteX, qrY + qrSize - 4, "Pindai untuk memverifikasi keaslian surat", 8.2, "Helvetica-Bold");
  lineAt(page, noteX, qrY + qrSize - 16, `Kode verifikasi: ${request.verificationCode}`, 8.2);
  lineAt(page, noteX, qrY + qrSize - 27, input.verificationUrl, 7.4);
  lineAt(
    page,
    noteX,
    qrY + qrSize - 38,
    `Diterbitkan melalui Sistem Informasi ${village.name}.`,
    7.4,
    "Helvetica-Oblique",
  );

  if (request.feeIdr > 0) {
    lineAt(page, noteX, qrY + qrSize - 49, `Retribusi: Rp ${formatNumber(request.feeIdr)}`, 7.4);
  }

  if (ctx.totalCopies > 1) {
    const text = `Lembar ${ctx.copyIndex + 1} dari ${ctx.totalCopies}`;
    const width = measureText(text, 7.4, "Helvetica");
    lineAt(page, PAGE.width - PAGE.marginX - width, qrY + qrSize + 4, text, 7.4);
  }

}

/* -------------------------------------------------------------------------- */
/* Small helpers kept local so the module reads top-to-bottom                  */
/* -------------------------------------------------------------------------- */

/** Centres a single line horizontally on the text baseline. */
function centerLine(page: PdfPage, baseline: number, text: string, size: number, font: FontName) {
  const width = measureText(text, size, font);
  lineAt(page, (PAGE.width - width) / 2, baseline, text, size, font);
}

/* -------------------------------------------------------------------------- */

export async function renderLetterPdf(input: LetterRenderInput): Promise<Uint8Array> {
  const doc = new PdfDocument({
    title: `${input.request.templateTitle} — ${input.request.ticket}`,
    subject: `${input.request.letterName} atas nama ${input.applicant.fullName}`,
    author: input.village.name,
  });

  // Pre-render the QR symbol once; the same matrix is drawn on every copy.
  const qr = QRCode.create(input.verificationUrl, { errorCorrectionLevel: "M" });
  const qrMatrix: QrMatrix = {
    size: qr.modules.size,
    get: (row, col) => Boolean(qr.modules.get(row, col)),
  };

  for (let copy = 0; copy < input.copies; copy += 1) {
    if (copy > 0) doc.addPage();
    drawCopy(doc.page, input, { qrMatrix, copyIndex: copy, totalCopies: input.copies });
  }

  return doc.build();
}
