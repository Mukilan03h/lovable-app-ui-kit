export type FileFormat = "pptx" | "docx" | "xlsx" | "pdf" | "html" | "md" | "csv" | "png" | "zip";

export const formatColor: Record<FileFormat, string> = {
  pptx: "#D24726",
  docx: "#2B579A",
  xlsx: "#217346",
  pdf: "#E5252A",
  html: "#7C3AED",
  md: "#475569",
  csv: "#16A34A",
  png: "#DB2777",
  zip: "#D97706",
};

export const formatLabel: Record<FileFormat, string> = {
  pptx: "PowerPoint",
  docx: "Word",
  xlsx: "Excel",
  pdf: "PDF",
  html: "Web app",
  md: "Markdown",
  csv: "CSV",
  png: "Image",
  zip: "Archive",
};
