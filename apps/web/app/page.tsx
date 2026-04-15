import { NavBar } from "@/components/NavBar";
import { GenerateForm } from "@/components/GenerateForm";
import { GalleryCard } from "@/components/GalleryCard";

export default function HomePage() {
  return (
    <>
      <NavBar />

      <main style={{ paddingTop: "60px" }}>

        {/* ---------------------------------------------------------------- */}
        {/* HERO                                                              */}
        {/* ---------------------------------------------------------------- */}
        <section style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "80px 40px 60px",
          maxWidth: "900px",
          margin: "0 auto",
          textAlign: "center",
        }}>
          {/* Eyebrow */}
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            fontFamily: "var(--font-jetbrains)",
            fontSize: "11px",
            color: "var(--teal)",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            marginBottom: "28px",
            padding: "6px 14px",
            borderRadius: "20px",
            border: "1px solid rgba(78,205,196,0.25)",
            background: "rgba(78,205,196,0.05)",
            animation: "fade-up 0.5s ease forwards",
          }}>
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--teal)", display: "inline-block" }} />
            AI-generated code visualizations
          </div>

          {/* Headline */}
          <h1 style={{
            fontFamily: "var(--font-syne)",
            fontWeight: 800,
            fontSize: "clamp(42px, 7vw, 88px)",
            lineHeight: 1.0,
            letterSpacing: "-0.03em",
            color: "var(--text)",
            marginBottom: "24px",
            animation: "fade-up 0.6s 0.1s ease both",
          }}>
            Code that<br />
            <span style={{ color: "var(--teal)", position: "relative" }}>
              explains itself
            </span>
          </h1>

          {/* Subheadline */}
          <p style={{
            fontFamily: "var(--font-jetbrains)",
            fontSize: "clamp(13px, 1.4vw, 16px)",
            color: "var(--muted)",
            lineHeight: 1.7,
            maxWidth: "540px",
            marginBottom: "60px",
            animation: "fade-up 0.6s 0.2s ease both",
          }}>
            Paste any function. Phantom&apos;s AI pipeline produces a cinematic animation
            of what your code actually does when it runs.
          </p>

          {/* Generate form card */}
          <div
            className="phantom-card"
            style={{
              width: "100%",
              maxWidth: "680px",
              padding: "32px",
              animation: "fade-up 0.6s 0.3s ease both",
            }}
          >
            <GenerateForm />
          </div>

          {/* Stats row */}
          <div style={{
            display: "flex",
            gap: "40px",
            marginTop: "48px",
            animation: "fade-up 0.6s 0.4s ease both",
          }}>
            {[
              { value: "10", label: "templates" },
              { value: "<60s", label: "render time" },
              { value: "5", label: "languages" },
            ].map(({ value, label }) => (
              <div key={label} style={{ textAlign: "center" }}>
                <div style={{
                  fontFamily: "var(--font-syne)",
                  fontWeight: 800,
                  fontSize: "28px",
                  color: "var(--teal)",
                  letterSpacing: "-0.02em",
                }}>{value}</div>
                <div style={{
                  fontFamily: "var(--font-jetbrains)",
                  fontSize: "11px",
                  color: "var(--muted)",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  marginTop: "2px",
                }}>{label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* GALLERY                                                           */}
        {/* ---------------------------------------------------------------- */}
        <section style={{
          padding: "80px 40px",
          maxWidth: "1100px",
          margin: "0 auto",
        }}>
          {/* Section header */}
          <div style={{ marginBottom: "40px" }}>
            <div style={{
              fontFamily: "var(--font-jetbrains)",
              fontSize: "11px",
              color: "var(--teal)",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              marginBottom: "10px",
            }}>
              // examples
            </div>
            <h2 style={{
              fontFamily: "var(--font-syne)",
              fontWeight: 700,
              fontSize: "clamp(24px, 3vw, 36px)",
              color: "var(--text)",
              letterSpacing: "-0.02em",
            }}>
              See it in action
            </h2>
          </div>

          {/* Gallery grid */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "20px",
          }}>
            <GalleryCard
              id="demo-fibonacci"
              title="fibonacci(5)"
              description="Binary recursion tree unfolds depth-first, duplicate sub-problems highlighted in red."
              language="Python"
              accent="#4ECDC4"
            />
            <GalleryCard
              id="demo-quicksort"
              title="quickSort([3,1,4,1,5,9])"
              description="Pivot selection and partition step animated as array elements swap positions."
              language="TypeScript"
              accent="#FF6B6B"
            />
            <GalleryCard
              id="demo-async"
              title="Promise.all([a,b,c])"
              description="Three async tasks run in parallel — timeline lanes show when each resolves."
              language="JavaScript"
              accent="#4ADE80"
            />
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* HOW IT WORKS                                                      */}
        {/* ---------------------------------------------------------------- */}
        <section style={{
          padding: "80px 40px",
          maxWidth: "900px",
          margin: "0 auto",
          borderTop: "1px solid var(--border)",
        }}>
          <div style={{ marginBottom: "40px" }}>
            <div style={{
              fontFamily: "var(--font-jetbrains)",
              fontSize: "11px",
              color: "var(--teal)",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              marginBottom: "10px",
            }}>
              // pipeline
            </div>
            <h2 style={{
              fontFamily: "var(--font-syne)",
              fontWeight: 700,
              fontSize: "clamp(24px, 3vw, 36px)",
              color: "var(--text)",
              letterSpacing: "-0.02em",
            }}>
              How it works
            </h2>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
            {[
              { step: "01", title: "Parse", desc: "tree-sitter extracts AST, functions, and call graph from your code" },
              { step: "02", title: "Analyze", desc: "Claude Opus reasons about what the code does conceptually" },
              { step: "03", title: "Plan", desc: "Picks the right visualization template and fills in the parameters" },
              { step: "04", title: "Render", desc: "Remotion produces a 1920×1080 MP4 with timed narration captions" },
            ].map(({ step, title, desc }, i) => (
              <div
                key={step}
                style={{
                  display: "flex",
                  gap: "24px",
                  padding: "20px 0",
                  borderBottom: i < 3 ? "1px solid var(--border)" : "none",
                  alignItems: "flex-start",
                }}
              >
                <div style={{
                  fontFamily: "var(--font-jetbrains)",
                  fontSize: "12px",
                  color: "var(--teal)",
                  opacity: 0.6,
                  flexShrink: 0,
                  paddingTop: "2px",
                  width: "30px",
                }}>{step}</div>
                <div>
                  <div style={{
                    fontFamily: "var(--font-syne)",
                    fontWeight: 700,
                    fontSize: "16px",
                    color: "var(--text)",
                    marginBottom: "4px",
                  }}>{title}</div>
                  <div style={{
                    fontFamily: "var(--font-jetbrains)",
                    fontSize: "13px",
                    color: "var(--muted)",
                    lineHeight: 1.5,
                  }}>{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Footer */}
        <footer style={{
          padding: "32px 40px",
          borderTop: "1px solid var(--border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}>
          <span style={{ fontFamily: "var(--font-syne)", fontWeight: 700, fontSize: "14px", color: "var(--muted)" }}>
            Phantom
          </span>
          <span style={{ fontFamily: "var(--font-jetbrains)", fontSize: "11px", color: "var(--muted)", opacity: 0.5 }}>
            v1 · Phase 4
          </span>
        </footer>

      </main>
    </>
  );
}
