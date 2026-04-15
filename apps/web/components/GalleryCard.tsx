"use client";
import Link from "next/link";

interface GalleryCardProps {
  title: string;
  description: string;
  language: string;
  id: string;
  accent?: string;
}

export function GalleryCard({ title, description, language, id, accent = "#4ECDC4" }: GalleryCardProps) {
  // Derive the RGB triplet for use in inline styles
  const accentRgb =
    accent === "#4ECDC4" ? "78,205,196" :
    accent === "#FF6B6B" ? "255,107,107" :
    "74,222,128";

  return (
    <Link href={`/v/${id}`} style={{ textDecoration: "none" }}>
      <div
        className="phantom-card"
        style={{
          padding: "24px",
          cursor: "pointer",
          transition: "border-color 0.2s, transform 0.2s",
          position: "relative",
          overflow: "hidden",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLDivElement).style.borderColor = accent;
          (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(78, 205, 196, 0.18)";
          (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
        }}
      >
        {/* Thumbnail placeholder */}
        <div style={{
          width: "100%",
          aspectRatio: "16/9",
          background: `linear-gradient(135deg, #0D1320 0%, rgba(${accentRgb},0.08) 100%)`,
          borderRadius: "8px",
          marginBottom: "16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "1px solid rgba(255,255,255,0.05)",
          position: "relative",
          overflow: "hidden",
        }}>
          {/* Decorative tree visualization hint */}
          <svg width="80" height="50" viewBox="0 0 80 50" opacity={0.3}>
            <circle cx="40" cy="8" r="6" fill="none" stroke={accent} strokeWidth="1.5" />
            <line x1="40" y1="14" x2="22" y2="26" stroke={accent} strokeWidth="1" />
            <line x1="40" y1="14" x2="58" y2="26" stroke={accent} strokeWidth="1" />
            <circle cx="22" cy="32" r="6" fill="none" stroke={accent} strokeWidth="1.5" />
            <circle cx="58" cy="32" r="6" fill="none" stroke={accent} strokeWidth="1.5" />
          </svg>
          <span style={{
            position: "absolute",
            top: "8px",
            right: "8px",
            fontFamily: "var(--font-jetbrains)",
            fontSize: "10px",
            color: accent,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            opacity: 0.7,
          }}>{language}</span>
        </div>

        <div style={{
          fontFamily: "var(--font-syne)",
          fontWeight: 700,
          fontSize: "16px",
          color: "var(--text)",
          marginBottom: "6px",
        }}>{title}</div>

        <div style={{
          fontFamily: "var(--font-jetbrains)",
          fontSize: "12px",
          color: "var(--muted)",
          lineHeight: 1.5,
          marginBottom: "16px",
        }}>{description}</div>

        <div style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          fontFamily: "var(--font-jetbrains)",
          fontSize: "11px",
          color: accent,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
        }}>
          Watch
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 6h8M7 3l3 3-3 3" stroke={accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
    </Link>
  );
}
