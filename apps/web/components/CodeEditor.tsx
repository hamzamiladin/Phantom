"use client";
import dynamic from "next/dynamic";

const MonacoEditor = dynamic(
  () => import("@monaco-editor/react").then((m) => m.default),
  {
    ssr: false,
    loading: () => (
      <div style={{
        height: "280px",
        background: "rgba(13,19,32,0.8)",
        borderRadius: "8px",
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

interface CodeEditorProps {
  value: string;
  onChange: (v: string) => void;
  language?: string;
}

export function CodeEditor({ value, onChange, language = "python" }: CodeEditorProps) {
  return (
    <div style={{ borderRadius: "8px", overflow: "hidden", border: "1px solid var(--teal-border)" }}>
      <MonacoEditor
        height="280px"
        language={language}
        value={value}
        onChange={(v) => onChange(v ?? "")}
        theme="vs-dark"
        options={{
          fontSize: 13,
          fontFamily: "var(--font-jetbrains), 'JetBrains Mono', monospace",
          lineHeight: 1.7,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          padding: { top: 16, bottom: 16 },
          renderLineHighlight: "none",
          overviewRulerLanes: 0,
          hideCursorInOverviewRuler: true,
          scrollbar: { verticalScrollbarSize: 4 },
        }}
        beforeMount={(monaco) => {
          monaco.editor.defineTheme("phantom-dark", {
            base: "vs-dark",
            inherit: true,
            rules: [
              { token: "keyword", foreground: "4ECDC4" },
              { token: "string", foreground: "4ADE80" },
              { token: "number", foreground: "FFD93D" },
              { token: "comment", foreground: "8B949E", fontStyle: "italic" },
              { token: "function", foreground: "F0F6FC", fontStyle: "bold" },
            ],
            colors: {
              "editor.background": "#0D1320",
              "editor.foreground": "#F0F6FC",
              "editorLineNumber.foreground": "#3D4F61",
              "editorCursor.foreground": "#4ECDC4",
              "editor.selectionBackground": "#1E3A5F",
              "editorIndentGuide.background1": "#1a2233",
            },
          });
          monaco.editor.setTheme("phantom-dark");
        }}
        onMount={(_editor, monaco) => {
          monaco.editor.setTheme("phantom-dark");
        }}
      />
    </div>
  );
}
