import { FileSpreadsheet, FileText, Presentation } from "lucide-react";
import type { ArtifactKind } from "@/data/knowledge";

export const artifactMeta: Record<
  ArtifactKind,
  { label: string; ext: string; icon: typeof FileText }
> = {
  slides: { label: "Slides", ext: ".pptx", icon: Presentation },
  doc: { label: "Document", ext: ".docx", icon: FileText },
  sheet: { label: "Spreadsheet", ext: ".xlsx", icon: FileSpreadsheet },
};
