import { cn } from "@/lib/utils";
import { formatColor, formatLabel, type FileFormat } from "./file-formats";

/** Document-shaped icon with a colored extension band, like a file manager. */
export function FileTypeIcon({ format, className }: { format: FileFormat; className?: string }) {
  const color = formatColor[format];
  return (
    <svg
      viewBox="0 0 32 40"
      className={cn("h-10 w-8 shrink-0", className)}
      aria-label={`${formatLabel[format]} file`}
    >
      <path
        d="M4 1h17l10 10v25a3 3 0 0 1-3 3H4a3 3 0 0 1-3-3V4a3 3 0 0 1 3-3z"
        fill="white"
        stroke="#0000001f"
      />
      <path d="M21 1v7a3 3 0 0 0 3 3h7" fill={color} fillOpacity="0.18" stroke="#0000001f" />
      <rect x="0" y="22" width="26" height="11" rx="2.5" fill={color} />
      <text
        x="13"
        y="30.2"
        textAnchor="middle"
        fontSize="7.2"
        fontWeight="700"
        fontFamily="ui-sans-serif, system-ui"
        fill="white"
      >
        {format.toUpperCase()}
      </text>
    </svg>
  );
}
