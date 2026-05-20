import * as FileSystem from "expo-file-system/legacy";
import { Share } from "react-native";

export type ReportMetric = {
  label: string;
  value: string | number;
};

export type ReportExportPayload = {
  title: string;
  subtitle: string;
  metrics: ReportMetric[];
  lines: string[];
  footer: string;
  filePrefix: string;
  accentColor?: string;
  backgroundColor?: string;
  textColor?: string;
};

const fallbackAccent = "#6d5dfc";
const fallbackBackground = "#050816";
const fallbackText = "#f8fafc";

const safeFileName = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "daily-discipline-report";

const escapeXml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const toPdfText = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .slice(0, 100);

const ensureCacheDirectory = () => {
  if (!FileSystem.cacheDirectory) {
    throw new Error("File export is not available on this platform.");
  }

  return FileSystem.cacheDirectory;
};

const buildShareMessage = (payload: ReportExportPayload) =>
  [
    payload.title,
    payload.subtitle,
    ...payload.metrics.map((metric) => `${metric.label}: ${metric.value}`),
    ...payload.lines,
    payload.footer,
  ].join("\n");

const buildSvg = (payload: ReportExportPayload) => {
  const accent = payload.accentColor ?? fallbackAccent;
  const background = payload.backgroundColor ?? fallbackBackground;
  const text = payload.textColor ?? fallbackText;
  const metrics = payload.metrics.slice(0, 4);
  const lines = payload.lines.slice(0, 6);

  const metricTiles = metrics
    .map((metric, index) => {
      const x = 80 + (index % 2) * 460;
      const y = 440 + Math.floor(index / 2) * 190;

      return `
        <rect x="${x}" y="${y}" width="400" height="150" rx="34" fill="rgba(255,255,255,0.10)" stroke="rgba(255,255,255,0.20)"/>
        <text x="${x + 34}" y="${y + 62}" font-size="48" font-weight="800" fill="${escapeXml(text)}">${escapeXml(String(metric.value))}</text>
        <text x="${x + 34}" y="${y + 106}" font-size="24" font-weight="700" fill="rgba(255,255,255,0.70)">${escapeXml(metric.label)}</text>
      `;
    })
    .join("\n");

  const insightLines = lines
    .map(
      (line, index) =>
        `<text x="96" y="${875 + index * 54}" font-size="30" font-weight="650" fill="rgba(255,255,255,0.82)">${escapeXml(line.slice(0, 62))}</text>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
  <defs>
    <radialGradient id="glow" cx="24%" cy="10%" r="80%">
      <stop offset="0%" stop-color="${escapeXml(accent)}" stop-opacity="0.92"/>
      <stop offset="58%" stop-color="${escapeXml(background)}" stop-opacity="1"/>
      <stop offset="100%" stop-color="#020617" stop-opacity="1"/>
    </radialGradient>
    <linearGradient id="card" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="rgba(255,255,255,0.18)"/>
      <stop offset="100%" stop-color="rgba(255,255,255,0.06)"/>
    </linearGradient>
  </defs>
  <rect width="1080" height="1350" fill="url(#glow)"/>
  <circle cx="910" cy="170" r="150" fill="${escapeXml(accent)}" opacity="0.20"/>
  <circle cx="115" cy="1140" r="220" fill="${escapeXml(accent)}" opacity="0.13"/>
  <rect x="54" y="54" width="972" height="1242" rx="62" fill="url(#card)" stroke="rgba(255,255,255,0.22)"/>
  <text x="90" y="150" font-size="28" font-weight="900" letter-spacing="5" fill="${escapeXml(accent)}">DAILY DISCIPLINE</text>
  <text x="90" y="240" font-size="64" font-weight="900" fill="${escapeXml(text)}">${escapeXml(payload.title.slice(0, 28))}</text>
  <text x="92" y="300" font-size="30" font-weight="700" fill="rgba(255,255,255,0.72)">${escapeXml(payload.subtitle.slice(0, 58))}</text>
  ${metricTiles}
  <text x="92" y="800" font-size="28" font-weight="900" letter-spacing="3" fill="${escapeXml(accent)}">COACHING NOTES</text>
  ${insightLines}
  <line x1="90" y1="1180" x2="990" y2="1180" stroke="rgba(255,255,255,0.18)" stroke-width="2"/>
  <text x="92" y="1238" font-size="26" font-weight="800" fill="rgba(255,255,255,0.72)">${escapeXml(payload.footer.slice(0, 70))}</text>
</svg>`;
};

const buildPdf = (payload: ReportExportPayload) => {
  const lines = [
    payload.title,
    payload.subtitle,
    "",
    ...payload.metrics.map((metric) => `${metric.label}: ${metric.value}`),
    "",
    ...payload.lines,
    "",
    payload.footer,
  ].slice(0, 18);

  const content = ["BT", "/F1 28 Tf", "48 760 Td", `(${toPdfText(lines[0] ?? "Daily Discipline")}) Tj`, "/F1 14 Tf"];
  lines.slice(1).forEach((line) => {
    content.push("0 -28 Td", `(${toPdfText(line)}) Tj`);
  });
  content.push("ET");
  const stream = content.join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets[index + 1] = pdf.length;
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return pdf;
};

export const exportReportAsSvgImage = async (payload: ReportExportPayload) => {
  const uri = `${ensureCacheDirectory()}${safeFileName(payload.filePrefix)}-${Date.now()}.svg`;
  await FileSystem.writeAsStringAsync(uri, buildSvg(payload), {
    encoding: FileSystem.EncodingType.UTF8,
  });
  await Share.share({
    title: payload.title,
    message: buildShareMessage(payload),
    url: uri,
  });
  return uri;
};

export const exportReportAsPdf = async (payload: ReportExportPayload) => {
  const uri = `${ensureCacheDirectory()}${safeFileName(payload.filePrefix)}-${Date.now()}.pdf`;
  await FileSystem.writeAsStringAsync(uri, buildPdf(payload), {
    encoding: FileSystem.EncodingType.UTF8,
  });
  await Share.share({
    title: payload.title,
    message: buildShareMessage(payload),
    url: uri,
  });
  return uri;
};
