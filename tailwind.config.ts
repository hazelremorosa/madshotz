import type { Config } from "tailwindcss";

/**
 * MAD SHOT'Z Design System — tokens.
 * The three "brand-*" hues are CSS variables so a selected Theme can recolor the
 * entire room at runtime (see src/store/session.ts + index.css).
 */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#0b0b12",
          soft: "#12121c",
          raised: "#1a1a28",
        },
        paper: {
          DEFAULT: "#f8f4ea",
          shade: "#ece5d3",
          ink: "#211d17",
        },
        brand: {
          a: "rgb(var(--brand-a) / <alpha-value>)",
          b: "rgb(var(--brand-b) / <alpha-value>)",
          c: "rgb(var(--brand-c) / <alpha-value>)",
        },
      },
      fontFamily: {
        display: [
          '"SF Pro Display"',
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        sans: [
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
        mono: [
          "ui-monospace",
          '"SF Mono"',
          "Menlo",
          "Consolas",
          '"Roboto Mono"',
          "monospace",
        ],
      },
      borderRadius: {
        xl2: "1.75rem",
        xl3: "2.25rem",
        xl4: "3rem",
      },
      boxShadow: {
        glass: "0 10px 40px -12px rgba(0,0,0,0.55), inset 0 1px 0 0 rgba(255,255,255,0.08)",
        float: "0 30px 80px -30px rgba(0,0,0,0.85)",
        bloom: "0 0 60px -8px rgb(var(--brand-a) / 0.55)",
        paper: "0 24px 60px -20px rgba(0,0,0,0.7), 0 2px 0 0 rgba(0,0,0,0.04)",
      },
      backdropBlur: {
        xs: "2px",
      },
      transitionTimingFunction: {
        spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
        smooth: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
      keyframes: {
        floaty: {
          "0%,100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
        breathe: {
          "0%,100%": { opacity: "0.55" },
          "50%": { opacity: "1" },
        },
        drift: {
          "0%": { transform: "translate(0,0) scale(1)" },
          "33%": { transform: "translate(4%,-3%) scale(1.08)" },
          "66%": { transform: "translate(-3%,4%) scale(0.96)" },
          "100%": { transform: "translate(0,0) scale(1)" },
        },
        shimmer: {
          "0%": { transform: "translateX(-120%)" },
          "100%": { transform: "translateX(220%)" },
        },
        spinslow: {
          to: { transform: "rotate(360deg)" },
        },
      },
      animation: {
        floaty: "floaty 6s ease-in-out infinite",
        breathe: "breathe 2.6s ease-in-out infinite",
        drift: "drift 22s ease-in-out infinite",
        shimmer: "shimmer 2.4s ease-in-out infinite",
        spinslow: "spinslow 14s linear infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
