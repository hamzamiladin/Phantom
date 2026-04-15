import Link from "next/link";

export function NavBar() {
  return (
    <nav
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 40px",
        height: "60px",
        borderBottom: "1px solid var(--border)",
        background: "rgba(10, 14, 24, 0.85)",
        backdropFilter: "blur(16px)",
      }}
    >
      <Link href="/" style={{ textDecoration: "none" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {/* Logo mark: teal diamond */}
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <rect
              x="10" y="1" width="12" height="12" rx="2"
              transform="rotate(45 10 1)"
              fill="none"
              stroke="#4ECDC4"
              strokeWidth="1.5"
            />
            <rect
              x="10" y="5" width="6" height="6" rx="1"
              transform="rotate(45 10 5)"
              fill="#4ECDC4"
              opacity="0.6"
            />
          </svg>
          <span style={{
            fontFamily: "var(--font-syne)",
            fontWeight: 700,
            fontSize: "16px",
            color: "var(--text)",
            letterSpacing: "0.02em",
          }}>
            Phantom
          </span>
        </div>
      </Link>

      <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
        <span style={{
          fontFamily: "var(--font-jetbrains)",
          fontSize: "11px",
          color: "var(--teal)",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          opacity: 0.8,
        }}>
          Beta
        </span>
      </div>
    </nav>
  );
}
