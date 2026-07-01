/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(${name}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // surfaces (CSS-variable backed → flip with light/dark theme)
        ink: {
          950: v("--ink-950"),
          900: v("--ink-900"),
          800: v("--ink-800"),
          700: v("--ink-700"),
          600: v("--ink-600"),
        },
        // text scale (also themed) — overrides Tailwind's slate on purpose
        slate: {
          50: v("--slate-50"),
          100: v("--slate-100"),
          200: v("--slate-200"),
          300: v("--slate-300"),
          400: v("--slate-400"),
          500: v("--slate-500"),
          600: v("--slate-600"),
          700: v("--slate-700"),
        },
        line: v("--line"), // borders / dividers / hover overlays
        fg: v("--fg"), // primary text / headings
        // one restrained accent (indigo) — same on both themes
        brand: { 300: "#a5b4fc", 400: "#8b93f8", 500: "#6366f1", 600: "#4f46e5" },
        accent: { 300: "#a5b4fc", 400: "#8b93f8", 500: "#6366f1", 600: "#4f46e5" },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      fontSize: { "2xs": ["0.6875rem", { lineHeight: "1rem" }] },
      boxShadow: {
        card: "0 1px 2px rgba(0,0,0,0.4)",
        pop: "0 8px 30px -10px rgba(0,0,0,0.7)",
      },
      borderRadius: { xl: "0.75rem" },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: { "fade-in": "fade-in 0.3s ease-out both" },
    },
  },
  plugins: [],
};
