"use client";
import React, { useState, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";

function detectLanguage(code: string): string {
  const src = code;
  const tsSignals = [
    '"use client"', "'use client'", "React.FC", "useState<", "useEffect(",
    "interface ", ": FC<", "JSX.Element", "export default function",
    "export const ", "from 'react'", 'from "react"', "from 'next/", 'from "next/',
    "=> {", "=> (",
  ];
  const tsScore = tsSignals.filter(s => src.includes(s)).length;
  const tsOnly = ["interface ", ": string", ": number", ": boolean", "<T>", "as const"];
  const tsOnlyScore = tsOnly.filter(s => src.includes(s)).length;
  const pySignals = ["def ", "elif ", "    pass", "self.", "__init__"];
  const pyScore = pySignals.filter(s => src.includes(s)).length;

  if (tsScore >= 2 || (tsScore >= 1 && tsOnlyScore >= 1)) {
    return tsOnlyScore >= 1 ? "typescript" : "javascript";
  }
  if (pyScore >= 2) return "python";
  if (src.includes("def ") || src.includes("elif ")) return "python";
  if (src.includes("function ") || src.includes("const ") || src.includes("let ")) return "javascript";
  return "python";
}

const CodeEditor = dynamic(
  () => import("./CodeEditor").then((m) => m.CodeEditor),
  {
    ssr: false,
    loading: () => (
      <div style={{
        height: "280px",
        background: "rgba(13,19,32,0.8)",
        borderRadius: "8px",
        border: "1px solid var(--teal-border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}>
        <span style={{ fontFamily: "var(--font-jetbrains)", fontSize: "12px", color: "var(--muted)" }}>
          Loading editor…
        </span>
      </div>
    ),
  }
);

const DEFAULT_CODE = `def fib(n):
    if n <= 1:
        return n
    return fib(n - 1) + fib(n - 2)

result = fib(5)`;

type Intent = "explain" | "debug" | "teach";
type Stage = "idle" | "queued" | "rendering" | "done" | "failed";

interface GenerateFormProps {
  onResult?: (jobId: string) => void;
}

export function GenerateForm({ onResult }: GenerateFormProps) {
  const [code, setCode] = useState(DEFAULT_CODE);
  const [intent, setIntent] = useState<Intent>("explain");
  const [stage, setStage] = useState<Stage>("idle");
  const language = useMemo(() => detectLanguage(code), [code]);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const poll = useCallback(
    async (id: string) => {
      const start = Date.now();
      const maxWait = 120_000;

      const tick = async () => {
        if (Date.now() - start > maxWait) {
          setStage("failed");
          setError("Render timed out. Please try again.");
          return;
        }

        try {
          const res = await fetch(`/api/status/${id}`);
          const data = await res.json() as { status: string; error?: string };

          if (data.status === "done") {
            setStage("done");
            setProgress(100);
            if (onResult) onResult(id);
            router.push(`/v/${id}`);
          } else if (data.status === "failed") {
            setStage("failed");
            setError(data.error ?? "Render failed");
          } else {
            setProgress((p) => Math.min(p + 3, 92));
            setTimeout(() => { void tick(); }, 1500);
          }
        } catch {
          setTimeout(() => { void tick(); }, 2000);
        }
      };

      await tick();
    },
    [onResult, router]
  );

  const handleGenerate = async () => {
    if (!code.trim()) return;
    setStage("queued");
    setProgress(0);
    setError(null);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, intent, language }),
      });

      if (!res.ok) throw new Error(await res.text());
      const data = await res.json() as { job_id: string };
      setStage("rendering");
      setProgress(5);
      void poll(data.job_id);
    } catch (err) {
      setStage("failed");
      setError(err instanceof Error ? err.message : "Failed to start generation");
    }
  };

  const isGenerating = stage === "queued" || stage === "rendering";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px", width: "100%" }}>
      {/* Code editor */}
      <div>
        <label style={{
          display: "block",
          fontFamily: "var(--font-jetbrains)",
          fontSize: "11px",
          color: "var(--teal)",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          marginBottom: "8px",
        }}>
          // paste your function
        </label>
        <CodeEditor value={code} onChange={setCode} language={language} />
      </div>

      {/* Intent selector */}
      <div>
        <label style={{
          display: "block",
          fontFamily: "var(--font-jetbrains)",
          fontSize: "11px",
          color: "var(--muted)",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          marginBottom: "10px",
        }}>
          Intent
        </label>
        <div style={{ display: "flex", gap: "8px" }}>
          {(["explain", "debug", "teach"] as Intent[]).map((i) => (
            <button
              key={i}
              onClick={() => setIntent(i)}
              style={{
                padding: "8px 20px",
                borderRadius: "6px",
                border: intent === i ? "1px solid var(--teal)" : "1px solid var(--border)",
                background: intent === i ? "rgba(78,205,196,0.12)" : "transparent",
                color: intent === i ? "var(--teal)" : "var(--muted)",
                fontFamily: "var(--font-jetbrains)",
                fontSize: "12px",
                fontWeight: intent === i ? 600 : 400,
                cursor: "pointer",
                letterSpacing: "0.06em",
                transition: "all 0.15s",
                textTransform: "capitalize",
              }}
            >
              {i}
            </button>
          ))}
        </div>
      </div>

      {/* Generate button + progress */}
      <div style={{ position: "relative" }}>
        <button
          onClick={() => { void handleGenerate(); }}
          disabled={isGenerating || !code.trim()}
          style={{
            width: "100%",
            padding: "16px",
            borderRadius: "10px",
            border: "none",
            background: isGenerating
              ? "rgba(78,205,196,0.2)"
              : "linear-gradient(135deg, #4ECDC4 0%, #22D3EE 100%)",
            color: isGenerating ? "var(--teal)" : "#0A0E18",
            fontFamily: "var(--font-syne)",
            fontWeight: 800,
            fontSize: "15px",
            letterSpacing: "0.04em",
            cursor: isGenerating ? "not-allowed" : "pointer",
            transition: "all 0.2s",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {isGenerating ? (
            <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "10px" }}>
              <span style={{
                width: "14px",
                height: "14px",
                borderRadius: "50%",
                border: "2px solid var(--teal)",
                borderTopColor: "transparent",
                display: "inline-block",
                animation: "spin 0.8s linear infinite",
              }} />
              {stage === "queued" ? "Queuing…" : `Rendering… ${Math.round(progress)}%`}
            </span>
          ) : "Generate Animation →"}
        </button>

        {/* Progress bar */}
        {isGenerating && (
          <div style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            height: "3px",
            width: `${progress}%`,
            background: "linear-gradient(90deg, #4ECDC4, #22D3EE)",
            borderRadius: "0 0 10px 10px",
            transition: "width 1s ease",
          }} />
        )}
      </div>

      {/* Error state */}
      {stage === "failed" && error && (
        <div style={{
          padding: "12px 16px",
          borderRadius: "8px",
          background: "rgba(255,107,107,0.08)",
          border: "1px solid rgba(255,107,107,0.3)",
          fontFamily: "var(--font-jetbrains)",
          fontSize: "12px",
          color: "#FF6B6B",
        }}>
          {error}
        </div>
      )}

      {/* Render time note */}
      {isGenerating && (
        <p style={{
          fontFamily: "var(--font-jetbrains)",
          fontSize: "11px",
          color: "var(--muted)",
          textAlign: "center",
          opacity: 0.7,
        }}>
          First render takes ~60s · Subsequent renders are faster
        </p>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
