import { Database, FileUp, Globe, HardDrive, Mail, Server } from "lucide-react";
import { cn } from "@/lib/utils";
import { brandPaths } from "./brand-paths";
import { brandSvgs } from "./brand-svgs";

/** Brands without a simple-icons glyph render as an initials tile in their brand color. */
const monograms: Record<string, { title: string; hex: string; text: string }> = {
  slack: { title: "Slack", hex: "#4A154B", text: "S" },
  salesforce: { title: "Salesforce", hex: "#00A1E0", text: "SF" },
  sharepoint: { title: "SharePoint", hex: "#036C70", text: "S" },
  teams: { title: "Microsoft Teams", hex: "#4B53BC", text: "T" },
  outlook: { title: "Outlook", hex: "#0078D4", text: "O" },
  onedrive: { title: "OneDrive", hex: "#0364B8", text: "1D" },
  openai: { title: "OpenAI", hex: "#0F0F0F", text: "AI" },
  gong: { title: "Gong", hex: "#8039DF", text: "G" },
  freshdesk: { title: "Freshdesk", hex: "#25C16F", text: "F" },
  servicenow: { title: "ServiceNow", hex: "#293E40", text: "SN" },
  guru: { title: "Guru", hex: "#6772E5", text: "G" },
  azure: { title: "Azure AD", hex: "#0078D4", text: "AZ" },
  vllm: { title: "vLLM", hex: "#30A2FF", text: "v" },
  bedrock: { title: "Amazon Bedrock", hex: "#01A88D", text: "B" },
};

const generic: Record<string, { title: string; icon: typeof Globe }> = {
  web: { title: "Web", icon: Globe },
  file: { title: "File upload", icon: FileUp },
  email: { title: "Email (IMAP)", icon: Mail },
  s3: { title: "Amazon S3", icon: HardDrive },
  postgres: { title: "Postgres", icon: Database },
  custom: { title: "Custom", icon: Server },
};

/** Glyph colors too light to read on the white logo tile. */
const hexOverride: Record<string, string> = { intercom: "#1F8DED", gitbook: "#346DDB" };

const brandTitle = (id: string) =>
  brandPaths[id]?.title ?? monograms[id]?.title ?? generic[id]?.title ?? id;

const sizes = {
  xs: "size-5 rounded-md",
  sm: "size-7 rounded-lg",
  md: "size-10 rounded-xl",
  lg: "size-12 rounded-2xl",
} as const;

const glyph = { xs: "size-3", sm: "size-4", md: "size-5", lg: "size-6" } as const;

export function BrandLogo({
  id,
  size = "md",
  className,
}: {
  id: string;
  size?: keyof typeof sizes;
  className?: string;
}) {
  const multicolor = brandSvgs[id];
  const brand = brandPaths[id];
  const mono = monograms[id];
  const gen = generic[id];
  const title = brandTitle(id);

  if (multicolor) {
    return (
      <span
        title={title}
        className={cn(
          "inline-grid shrink-0 place-items-center border border-black/5 bg-white shadow-sm dark:border-white/10",
          sizes[size],
          className,
        )}
      >
        <svg
          viewBox={multicolor.viewBox}
          role="img"
          aria-label={title}
          className={glyph[size]}
          dangerouslySetInnerHTML={{ __html: multicolor.inner }}
        />
      </span>
    );
  }

  if (mono) {
    return (
      <span
        title={title}
        className={cn(
          "inline-grid shrink-0 place-items-center font-bold text-white shadow-sm",
          sizes[size],
          className,
        )}
        style={{ background: mono.hex, fontSize: size === "xs" ? 8 : size === "sm" ? 10 : 13 }}
      >
        {mono.text}
      </span>
    );
  }

  return (
    <span
      title={title}
      className={cn(
        "inline-grid shrink-0 place-items-center border border-black/5 bg-white shadow-sm dark:border-white/10",
        sizes[size],
        className,
      )}
    >
      {brand ? (
        <svg
          viewBox="0 0 24 24"
          role="img"
          aria-label={title}
          className={glyph[size]}
          fill={hexOverride[id] ?? brand.hex}
        >
          <path d={brand.path} />
        </svg>
      ) : gen ? (
        <gen.icon className={cn(glyph[size], "text-neutral-700")} aria-label={title} />
      ) : (
        <span className="text-[10px] font-bold text-neutral-700">{title.slice(0, 2)}</span>
      )}
    </span>
  );
}
