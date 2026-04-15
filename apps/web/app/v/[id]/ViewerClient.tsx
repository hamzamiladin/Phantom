"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";

const AnimationPlayer = dynamic(
  () => import("@/components/AnimationPlayer").then((m) => m.AnimationPlayer),
  { ssr: false },
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NarrationCaption {
  start_ms: number;
  end_ms: number;
  text: string;
  subtext?: string | null;
  narrative_phase?: string | null;
}

interface NarrationData {
  captions: NarrationCaption[];
  total_duration_ms: number;
}

interface JobData {
  job_id: string;
  status: string;
  template: string;
  props: Record<string, unknown> | null;
  narration: NarrationData | null;
  title: string | null;
  description: string | null;
  time_complexity: string | null;
  space_complexity: string | null;
  patterns: string[];
  key_insight: string | null;
  result_url: string | null;
  thumbnail_url: string | null;
  error: string | null;
}

interface ChatMessage {
  role: "user" | "ai";
  text: string;
}

interface StepData {
  step_index: number;
  line_number: number;
  label: string;
  variables: Record<string, string>;
  subtext?: string;
  narrative_phase?: string;
}

type PlayerHandle = {
  getCurrentFrame: () => number;
  seekTo: (frame: number) => void;
} | null;

// ---------------------------------------------------------------------------
// Design tokens — cinematic dark with warm accents
// ---------------------------------------------------------------------------
const T = {
  bg: "#06090F",
  panel: "#080C14",
  card: "rgba(255,255,255,0.025)",
  cardHover: "rgba(255,255,255,0.045)",
  border: "rgba(255,255,255,0.06)",
  borderActive: "rgba(255,255,255,0.12)",
  teal: "#4ECDC4",
  tealDim: "rgba(78,205,196,0.55)",
  tealBorder: "rgba(78,205,196,0.18)",
  tealBg: "rgba(78,205,196,0.06)",
  amber: "#F59E0B",
  amberBorder: "rgba(245,158,11,0.2)",
  amberBg: "rgba(245,158,11,0.06)",
  green: "#4ADE80",
  text: "#E8ECF4",
  textSoft: "rgba(232,236,244,0.72)",
  muted: "#525A67",
  dimmed: "rgba(232,236,244,0.38)",
  serif: "'Instrument Serif', 'Georgia', serif",
  font: "var(--font-syne, 'SF Pro Display', system-ui, sans-serif)",
  mono: "var(--font-jetbrains, 'SF Mono', 'Fira Code', monospace)",
};

const FRAMES_PER_STEP = 72;

// Phase styling
const PHASES: Record<string, { label: string; color: string; icon: string }> = {
  overview:  { label: "Overview",  color: "#3ECFA0", icon: "○" },
  mechanism: { label: "Mechanics", color: "#60A5FA", icon: "◇" },
  execution: { label: "Execution", color: "#3D8EFF", icon: "▸" },
  insight:   { label: "Insight",   color: "#FBBF24", icon: "★" },
};

// ---------------------------------------------------------------------------
// Suggested questions for chat
// ---------------------------------------------------------------------------
function suggestedQuestions(patterns: string[]): string[] {
  const qs: string[] = [];
  if (patterns.some(p => p.includes("recurs"))) qs.push("Why recursion?");
  if (patterns.includes("memoization") || patterns.includes("overlapping_subproblems")) qs.push("How does memoization help?");
  if (patterns.some(p => p.includes("async") || p.includes("parallel"))) qs.push("Why async/await?");
  if (patterns.some(p => p.includes("sort") || p.includes("divide"))) qs.push("Why O(n log n)?");
  qs.push("Explain simply");
  return qs.slice(0, 3);
}

// ---------------------------------------------------------------------------
// Speed controls — minimal pill row
// ---------------------------------------------------------------------------
const SPEEDS = [0.5, 1, 1.5, 2] as const;

function SpeedControls({ speed, onChange }: { speed: number; onChange: (s: number) => void }) {
  return (
    <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
      <span style={{ fontFamily: T.mono, fontSize: "9px", color: T.muted, marginRight: "3px", letterSpacing: "0.1em" }}>
        SPEED
      </span>
      {SPEEDS.map((s) => (
        <button key={s} onClick={() => onChange(s)} style={{
          padding: "3px 9px", borderRadius: "4px",
          border: speed === s ? `1px solid ${T.tealBorder}` : `1px solid transparent`,
          background: speed === s ? T.tealBg : "transparent",
          color: speed === s ? T.teal : T.muted,
          fontFamily: T.mono, fontSize: "11px", cursor: "pointer",
          transition: "all 0.2s", fontWeight: speed === s ? "600" : "400",
        }}>
          {s}x
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step timeline item — clickable, expandable
// ---------------------------------------------------------------------------
function StepRow({
  step,
  index,
  isActive,
  isPast,
  stepProgress,
  code,
  language,
  onClick,
}: {
  step: StepData;
  index: number;
  isActive: boolean;
  isPast: boolean;
  stepProgress: number; // 0..1 within this step
  code: string;
  language: string;
  onClick: () => void;
}) {
  const phase = step.narrative_phase ?? "execution";
  const phaseInfo = PHASES[phase] ?? PHASES.execution;
  const vars = Object.entries(step.variables);

  return (
    <div
      onClick={onClick}
      style={{
        cursor: "pointer",
        borderRadius: "8px",
        border: isActive ? `1px solid ${phaseInfo.color}30` : `1px solid transparent`,
        background: isActive ? `${phaseInfo.color}08` : "transparent",
        padding: isActive ? "14px 14px 12px" : "8px 14px",
        transition: "all 0.35s cubic-bezier(0.22, 1, 0.36, 1)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Active step progress bar — thin line at top */}
      {isActive && (
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: "2px",
          background: T.border,
        }}>
          <div style={{
            height: "2px",
            width: `${stepProgress * 100}%`,
            background: phaseInfo.color,
            transition: "width 0.1s linear",
            boxShadow: `0 0 8px ${phaseInfo.color}40`,
          }} />
        </div>
      )}

      {/* Step header row */}
      <div style={{
        display: "flex", alignItems: "flex-start", gap: "10px",
      }}>
        {/* Step number circle */}
        <div style={{
          width: 24, height: 24, borderRadius: "50%",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0, marginTop: "1px",
          background: isActive ? phaseInfo.color : isPast ? `${phaseInfo.color}22` : T.card,
          border: `1px solid ${isActive ? phaseInfo.color : isPast ? `${phaseInfo.color}44` : T.border}`,
          transition: "all 0.3s ease",
        }}>
          <span style={{
            fontFamily: T.mono, fontSize: "10px", fontWeight: "700",
            color: isActive ? T.bg : isPast ? phaseInfo.color : T.muted,
          }}>
            {isPast ? "✓" : index + 1}
          </span>
        </div>

        {/* Label + phase */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "3px" }}>
            <span style={{
              fontFamily: T.mono, fontSize: "8px", letterSpacing: "0.1em",
              color: phaseInfo.color, opacity: isActive ? 0.9 : 0.5,
              textTransform: "uppercase",
            }}>
              {phaseInfo.icon} {phaseInfo.label}
            </span>
          </div>
          <p style={{
            fontFamily: T.font, fontSize: isActive ? "14px" : "12px",
            color: isActive ? T.text : isPast ? T.textSoft : T.dimmed,
            lineHeight: "1.45", margin: 0,
            transition: "all 0.3s ease",
            overflow: isActive ? "visible" : "hidden",
            textOverflow: isActive ? "unset" : "ellipsis",
            whiteSpace: isActive ? "normal" : "nowrap",
          }}>
            {step.label}
          </p>

          {/* Subtext — only on active */}
          {isActive && step.subtext && (
            <p style={{
              fontFamily: T.font, fontSize: "11px",
              color: T.dimmed, lineHeight: "1.5",
              margin: "6px 0 0", fontStyle: "italic",
            }}>
              {step.subtext}
            </p>
          )}
        </div>
      </div>

      {/* Expanded details — only on active step */}
      {isActive && vars.length > 0 && (
        <div style={{
          marginTop: "12px", paddingTop: "10px",
          borderTop: `1px solid ${T.border}`,
        }}>
          <div style={{
            fontFamily: T.mono, fontSize: "8px", color: T.muted,
            letterSpacing: "0.12em", marginBottom: "6px",
          }}>
            STATE
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
            {vars.map(([key, val]) => (
              <div key={key} style={{
                display: "inline-flex", gap: "5px", alignItems: "center",
                padding: "3px 8px", borderRadius: "4px",
                background: "rgba(255,255,255,0.03)",
                border: `1px solid ${T.border}`,
              }}>
                <span style={{ fontFamily: T.mono, fontSize: "10px", color: T.tealDim }}>{key}</span>
                <span style={{ fontFamily: T.mono, fontSize: "10px", color: T.text, fontWeight: "600" }}>
                  {val.length > 16 ? val.slice(0, 14) + "\u2026" : val}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Code line — only on active step */}
      {isActive && code && (
        <div style={{ marginTop: "10px" }}>
          <div style={{
            fontFamily: T.mono, fontSize: "8px", color: T.muted,
            letterSpacing: "0.12em", marginBottom: "4px",
          }}>
            {language.toUpperCase()} : {step.line_number}
          </div>
          {(() => {
            const lines = code.split("\n");
            const ln = step.line_number;
            const start = Math.max(0, ln - 2);
            const end = Math.min(lines.length, ln + 2);
            return lines.slice(start, end).map((line, i) => {
              const num = start + i + 1;
              const isHit = num === ln;
              return (
                <div key={i} style={{
                  display: "flex", gap: "8px", padding: "1px 6px",
                  borderRadius: "3px",
                  background: isHit ? `${phaseInfo.color}0C` : "transparent",
                  borderLeft: isHit ? `2px solid ${phaseInfo.color}` : "2px solid transparent",
                }}>
                  <span style={{
                    fontFamily: T.mono, fontSize: "10px", width: "18px", textAlign: "right",
                    color: isHit ? phaseInfo.color : T.muted, flexShrink: 0,
                  }}>{num}</span>
                  <span style={{
                    fontFamily: T.mono, fontSize: "10px",
                    color: isHit ? T.text : T.dimmed,
                    whiteSpace: "pre", overflow: "hidden", textOverflow: "ellipsis",
                  }}>{line || " "}</span>
                </div>
              );
            });
          })()}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Right panel
// ---------------------------------------------------------------------------
function InfoPanel({
  job,
  jobId,
  steps,
  code,
  language,
  activeStepIndex,
  stepProgress,
  onSeekToStep,
}: {
  job: JobData;
  jobId: string;
  steps: StepData[];
  code: string;
  language: string;
  activeStepIndex: number;
  stepProgress: number;
  onSeekToStep: (stepIndex: number) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [asking, setAsking] = useState(false);
  const [expandedSection, setExpandedSection] = useState<"steps" | "chat">("steps");
  const bottomRef = useRef<HTMLDivElement>(null);
  const activeStepRef = useRef<HTMLDivElement>(null);

  const suggestions = suggestedQuestions(job.patterns ?? []);

  // Auto-scroll to active step
  useEffect(() => {
    if (activeStepRef.current && expandedSection === "steps") {
      activeStepRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [activeStepIndex, expandedSection]);

  const sendQuestion = useCallback(async (question: string) => {
    if (!question.trim() || asking) return;
    const q = question.trim();
    setMessages(prev => [...prev, { role: "user", text: q }]);
    setInput("");
    setAsking(true);
    setExpandedSection("chat");

    try {
      const codeStr = (job.props as Record<string, unknown> | null)?.code as string | undefined ?? "";
      const context = [job.description, job.key_insight].filter(Boolean).join(" | ");
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: codeStr, question: q, context }),
      });
      const data = await res.json() as { answer?: string; error?: string };
      setMessages(prev => [...prev, {
        role: "ai",
        text: data.answer ?? data.error ?? "Something went wrong.",
      }]);
    } catch {
      setMessages(prev => [...prev, { role: "ai", text: "Couldn't reach the engine." }]);
    } finally {
      setAsking(false);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  }, [asking, job]);

  return (
    <div style={{
      display: "flex", flexDirection: "column", height: "100%",
    }}>
      {/* Panel header with section toggle */}
      <div style={{
        padding: "16px 20px 0",
        display: "flex", gap: "2px", flexShrink: 0,
      }}>
        {(["steps", "chat"] as const).map(section => (
          <button key={section} onClick={() => setExpandedSection(section)} style={{
            flex: 1, padding: "8px 0", border: "none", cursor: "pointer",
            borderBottom: expandedSection === section ? `2px solid ${T.teal}` : `2px solid ${T.border}`,
            background: "transparent",
            fontFamily: T.mono, fontSize: "9px", letterSpacing: "0.12em",
            color: expandedSection === section ? T.teal : T.muted,
            transition: "all 0.2s",
            textTransform: "uppercase",
          }}>
            {section === "steps" ? `Steps ${activeStepIndex >= 0 ? `${activeStepIndex + 1}/${steps.length}` : ""}` : `Ask${messages.length > 0 ? ` (${messages.length})` : ""}`}
          </button>
        ))}
      </div>

      {/* Steps section */}
      {expandedSection === "steps" && (
        <div style={{
          flex: 1, overflowY: "auto", padding: "12px 16px 16px",
          display: "flex", flexDirection: "column", gap: "4px",
        }}>
          {/* Description — compact, always visible at top */}
          {job.description && (
            <div style={{
              padding: "10px 12px", borderRadius: "6px",
              background: T.card, marginBottom: "6px",
            }}>
              <p style={{
                fontFamily: T.font, fontSize: "12px", color: T.textSoft,
                lineHeight: "1.55", margin: 0,
              }}>
                {job.description}
              </p>
            </div>
          )}

          {/* Step timeline */}
          {steps.map((step, i) => (
            <div key={i} ref={i === activeStepIndex ? activeStepRef : undefined}>
              <StepRow
                step={step}
                index={i}
                isActive={i === activeStepIndex}
                isPast={i < activeStepIndex}
                stepProgress={i === activeStepIndex ? stepProgress : 0}
                code={code}
                language={language}
                onClick={() => onSeekToStep(i)}
              />
            </div>
          ))}

          {/* Complexity + insight footer */}
          {(job.key_insight || job.time_complexity) && (
            <div style={{
              marginTop: "8px", padding: "12px 14px", borderRadius: "8px",
              background: T.card, border: `1px solid ${T.border}`,
            }}>
              {job.key_insight && (
                <div style={{ marginBottom: job.time_complexity ? "10px" : 0 }}>
                  <div style={{
                    fontFamily: T.mono, fontSize: "8px", color: "#FBBF24",
                    letterSpacing: "0.12em", marginBottom: "4px", opacity: 0.8,
                  }}>
                    KEY INSIGHT
                  </div>
                  <p style={{
                    fontFamily: T.font, fontSize: "12px", color: T.textSoft,
                    lineHeight: "1.5", margin: 0,
                  }}>
                    {job.key_insight}
                  </p>
                </div>
              )}
              {(job.time_complexity || job.space_complexity) && (
                <div style={{ display: "flex", gap: "12px" }}>
                  {job.time_complexity && (
                    <span style={{ fontFamily: T.mono, fontSize: "11px", color: T.teal }}>
                      <span style={{ fontSize: "8px", color: T.muted, letterSpacing: "0.08em" }}>TIME </span>
                      {job.time_complexity}
                    </span>
                  )}
                  {job.space_complexity && (
                    <span style={{ fontFamily: T.mono, fontSize: "11px", color: "#A78BFA" }}>
                      <span style={{ fontSize: "8px", color: T.muted, letterSpacing: "0.08em" }}>SPACE </span>
                      {job.space_complexity}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Chat section */}
      {expandedSection === "chat" && (
        <div style={{
          flex: 1, display: "flex", flexDirection: "column",
          padding: "12px 16px 16px",
          overflow: "hidden",
        }}>
          {/* Messages area */}
          <div style={{ flex: 1, overflowY: "auto", marginBottom: "10px" }}>
            {/* Suggestion pills */}
            {messages.length === 0 && (
              <div style={{
                display: "flex", flexDirection: "column", gap: "6px",
                padding: "20px 0",
              }}>
                <p style={{
                  fontFamily: T.font, fontSize: "13px", color: T.textSoft,
                  lineHeight: "1.5", margin: "0 0 12px",
                }}>
                  Ask anything about this code. Try:
                </p>
                {suggestions.map(q => (
                  <button key={q} onClick={() => { void sendQuestion(q); }} style={{
                    padding: "8px 14px", borderRadius: "6px", textAlign: "left",
                    border: `1px solid ${T.border}`,
                    background: T.card,
                    fontFamily: T.font, fontSize: "12px", color: T.textSoft,
                    cursor: "pointer", transition: "all 0.15s",
                  }}
                    onMouseEnter={e => {
                      (e.currentTarget).style.borderColor = T.tealBorder;
                      (e.currentTarget).style.color = T.teal;
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget).style.borderColor = T.border;
                      (e.currentTarget).style.color = T.textSoft;
                    }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} style={{
                display: "flex",
                justifyContent: m.role === "user" ? "flex-end" : "flex-start",
                marginBottom: "8px",
              }}>
                <div style={{
                  maxWidth: "88%",
                  padding: "9px 13px",
                  borderRadius: m.role === "user" ? "10px 10px 3px 10px" : "10px 10px 10px 3px",
                  background: m.role === "user" ? T.tealBg : T.card,
                  border: `1px solid ${m.role === "user" ? T.tealBorder : T.border}`,
                  borderLeft: m.role === "ai" ? `2px solid ${T.amber}` : undefined,
                  fontFamily: T.font, fontSize: "12px",
                  color: m.role === "user" ? T.teal : T.text,
                  lineHeight: "1.5",
                }}>
                  {m.text}
                </div>
              </div>
            ))}

            {asking && (
              <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: "8px" }}>
                <div style={{
                  padding: "9px 13px", borderRadius: "10px 10px 10px 3px",
                  background: T.card, border: `1px solid ${T.border}`,
                  borderLeft: `2px solid ${T.amber}`,
                  fontFamily: T.mono, fontSize: "13px", color: T.amber, letterSpacing: "0.2em",
                }}>
                  ...
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{
            display: "flex", gap: "6px",
            background: T.card, border: `1px solid ${T.border}`,
            borderRadius: "8px", padding: "6px 8px 6px 12px",
            alignItems: "flex-end", flexShrink: 0,
          }}>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void sendQuestion(input);
                }
              }}
              placeholder="Ask about this code..."
              rows={1}
              style={{
                flex: 1, background: "transparent", border: "none", outline: "none",
                fontFamily: T.font, fontSize: "12px", color: T.text,
                resize: "none", lineHeight: "1.5", scrollbarWidth: "none",
              }}
            />
            <button
              onClick={() => { void sendQuestion(input); }}
              disabled={asking || !input.trim()}
              style={{
                flexShrink: 0, width: 28, height: 28, borderRadius: "6px",
                border: "none",
                background: input.trim() && !asking ? T.teal : `${T.teal}33`,
                color: T.bg, cursor: input.trim() && !asking ? "pointer" : "default",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "13px", transition: "all 0.15s", fontWeight: "700",
              }}
            >
              &uarr;
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main viewer component
// ---------------------------------------------------------------------------
export function ViewerClient({ jobId }: { jobId: string }) {
  const [job, setJob] = useState<JobData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [speed, setSpeed] = useState<number>(1);
  const [currentFrame, setCurrentFrame] = useState(0);
  const playerRef = useRef<PlayerHandle>(null);

  useEffect(() => {
    const fetchJob = async () => {
      try {
        const res = await fetch(`/api/status/${jobId}`);
        if (res.ok) setJob((await res.json()) as JobData);
      } catch { /* ignore */ } finally {
        setLoading(false);
      }
    };
    void fetchJob();
  }, [jobId]);

  useEffect(() => {
    if (!playerRef.current) return;
    const interval = setInterval(() => {
      if (playerRef.current) setCurrentFrame(playerRef.current.getCurrentFrame());
    }, 80);
    return () => clearInterval(interval);
  }, [job?.status]);

  const handleShare = useCallback(() => {
    void navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, []);

  // Extract step data from animation props
  const animProps = job?.props as { steps?: StepData[]; code?: string; language?: string } | null;
  const steps = animProps?.steps ?? [];
  const code = animProps?.code ?? "";
  const language = animProps?.language ?? "python";

  // Sync step index directly from frame count — perfectly matches animation
  const activeStepIndex = steps.length > 0
    ? Math.min(Math.floor(currentFrame / FRAMES_PER_STEP), steps.length - 1)
    : -1;
  const stepProgress = (currentFrame % FRAMES_PER_STEP) / FRAMES_PER_STEP;

  // Seek to a specific step when user clicks it
  const handleSeekToStep = useCallback((stepIndex: number) => {
    if (playerRef.current) {
      playerRef.current.seekTo(stepIndex * FRAMES_PER_STEP + 18);
    }
  }, []);

  // Caption data for beat counter
  const captions = job?.narration?.captions ?? [];

  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.text }}>

      {/* Top bar — minimal */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 32px",
        borderBottom: `1px solid ${T.border}`,
        background: "rgba(6,9,15,0.92)",
        backdropFilter: "blur(16px)",
        position: "sticky", top: 0, zIndex: 10,
      }}>
        <Link href="/" style={{
          display: "inline-flex", alignItems: "center", gap: "5px",
          fontFamily: T.mono, fontSize: "10px", color: T.muted,
          textDecoration: "none", letterSpacing: "0.06em",
          transition: "color 0.15s",
        }}
          onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = T.teal; }}
          onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = T.muted; }}
        >
          &larr; Back
        </Link>

        <div style={{
          fontFamily: T.mono, fontSize: "10px", color: T.teal,
          letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: "700", opacity: 0.7,
        }}>
          Phantom
        </div>

        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          <button onClick={handleShare} style={{
            padding: "5px 14px", borderRadius: "5px",
            border: `1px solid ${copied ? "rgba(74,222,128,0.3)" : T.tealBorder}`,
            background: copied ? "rgba(74,222,128,0.06)" : "transparent",
            color: copied ? T.green : T.tealDim,
            fontFamily: T.mono, fontSize: "10px", cursor: "pointer",
            transition: "all 0.15s", letterSpacing: "0.06em",
          }}>
            {copied ? "Copied" : "Share"}
          </button>
          {job?.result_url && (
            <a href={job.result_url} download style={{
              padding: "5px 14px", borderRadius: "5px",
              border: `1px solid ${T.border}`,
              background: "transparent", color: T.muted,
              fontFamily: T.mono, fontSize: "10px",
              textDecoration: "none", transition: "all 0.15s",
              letterSpacing: "0.06em",
            }}>
              MP4
            </a>
          )}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <LoadingState />
      ) : job?.status === "done" ? (
        <div style={{ display: "flex", height: "calc(100vh - 49px)" }}>

          {/* Left: player */}
          <div style={{
            flex: "1 1 62%", display: "flex", flexDirection: "column",
            padding: "24px 24px 16px 32px",
            borderRight: `1px solid ${T.border}`,
            overflow: "auto", minWidth: 0,
          }}>
            {job.title && (
              <div style={{
                fontFamily: T.serif, fontSize: "20px", color: T.text,
                marginBottom: "12px", letterSpacing: "-0.01em",
                fontWeight: "400",
              }}>
                {job.title}
              </div>
            )}

            <div style={{ flex: 1, minHeight: 0 }}>
              <AnimationPlayer
                compositionId={job.template}
                inputProps={job.props ?? undefined}
                autoPlay controls
                playbackRate={speed}
                playerRef={playerRef as React.RefObject<{ getCurrentFrame: () => number; seekTo: (frame: number) => void } | null>}
              />
            </div>

            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              marginTop: "10px", padding: "8px 12px",
              borderRadius: "6px", background: T.card, border: `1px solid ${T.border}`,
            }}>
              <SpeedControls speed={speed} onChange={setSpeed} />
              {steps.length > 0 && (
                <div style={{ fontFamily: T.mono, fontSize: "10px", color: T.muted }}>
                  <span style={{ color: T.teal, fontWeight: "600" }}>{Math.max(1, activeStepIndex + 1)}</span>
                  <span style={{ opacity: 0.5 }}> / {steps.length}</span>
                </div>
              )}
            </div>
          </div>

          {/* Right: info panel */}
          <div style={{
            flex: "0 0 38%", maxWidth: "440px",
            display: "flex", flexDirection: "column",
            background: T.panel, overflow: "hidden",
          }}>
            <InfoPanel
              job={job}
              jobId={jobId}
              steps={steps}
              code={code}
              language={language}
              activeStepIndex={activeStepIndex}
              stepProgress={stepProgress}
              onSeekToStep={handleSeekToStep}
            />
          </div>
        </div>
      ) : (
        <PendingState job={job} />
      )}

      <style>{`
        textarea::-webkit-scrollbar { display: none; }
        div::-webkit-scrollbar { width: 4px; }
        div::-webkit-scrollbar-track { background: transparent; }
        div::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 2px; }
        div::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.15); }
        @media (max-width: 768px) {
          .viewer-layout { flex-direction: column !important; height: auto !important; }
        }
      `}</style>
    </div>
  );
}

function LoadingState() {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      height: "calc(100vh - 49px)", flexDirection: "column", gap: "14px",
    }}>
      <div style={{
        width: "28px", height: "28px", borderRadius: "50%",
        border: `2px solid rgba(78,205,196,0.2)`,
        borderTopColor: T.teal,
        animation: "spin 0.8s linear infinite",
      }} />
      <span style={{ fontFamily: T.mono, fontSize: "11px", color: T.muted }}>
        Loading...
      </span>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function PendingState({ job }: { job: JobData | null }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      height: "calc(100vh - 49px)", flexDirection: "column", gap: "10px",
    }}>
      <span style={{ fontFamily: T.font, fontSize: "18px", color: T.text }}>
        {job?.status === "rendering" ? "Still rendering..." : "Job not found"}
      </span>
      {job?.status === "rendering" && (
        <div style={{
          width: "28px", height: "28px", borderRadius: "50%",
          border: `2px solid rgba(78,205,196,0.2)`,
          borderTopColor: T.teal,
          animation: "spin 0.8s linear infinite",
        }} />
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
