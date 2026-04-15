import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        phantom: {
          bg: "#0A0E18",
          "bg-2": "#0D1320",
          teal: "#4ECDC4",
          coral: "#FF6B6B",
          green: "#4ADE80",
          text: "#F0F6FC",
          muted: "#8B949E",
        },
      },
      fontFamily: {
        display: ["var(--font-syne)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains)", "monospace"],
      },
    },
  },
};

export default config;
