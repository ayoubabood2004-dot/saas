/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: { "2xl": "1200px" },
    },
    extend: {
      colors: {
        /* ---- Semantic, theme-aware (driven by CSS vars in tokens.css) ---- */
        surface: {
          DEFAULT: "rgb(var(--surface) / <alpha-value>)",
          1: "rgb(var(--surface-1) / <alpha-value>)",
          2: "rgb(var(--surface-2) / <alpha-value>)",
          3: "rgb(var(--surface-3) / <alpha-value>)",
        },
        ink: {
          DEFAULT: "rgb(var(--ink) / <alpha-value>)",
          muted: "rgb(var(--ink-muted) / <alpha-value>)",
          subtle: "rgb(var(--ink-subtle) / <alpha-value>)",
        },
        line: {
          DEFAULT: "rgb(var(--line) / <alpha-value>)",
          strong: "rgb(var(--line-strong) / <alpha-value>)",
        },

        /* ---- Vet Medical Blue: the core brand anchor (Pantone 2191 C feel) ---- */
        brand: {
          50: "#eef6ff",
          100: "#d9ebff",
          200: "#bad9ff",
          300: "#8cc0ff",
          400: "#589ffb",
          500: "#2f7df2",
          600: "#1266d8", // primary
          700: "#0f51b0",
          800: "#13468d",
          900: "#143b73",
          950: "#0d2449",
        },
        /* Soft sky for gradients & calm fills */
        sky: {
          50: "#f0f9ff",
          100: "#e0f2fe",
          200: "#bae6fd",
          300: "#7dd3fc",
          400: "#38bdf8",
          500: "#0ea5e9",
          600: "#0284c7",
          700: "#0369a1",
        },
        /* Warm consumer-delight accent (coral) — used sparingly */
        accent: {
          50: "#fff4ed",
          100: "#ffe6d5",
          200: "#ffc9aa",
          300: "#ffa274",
          400: "#ff6f3c",
          500: "#fb5413",
          600: "#ec3a09",
          700: "#c32a0a",
        },
        success: {
          50: "#f0fdf4",
          100: "#dcfce7",
          200: "#bbf7d0",
          500: "#22c55e",
          600: "#16a34a",
          700: "#15803d",
        },
        warn: {
          50: "#fffbeb",
          100: "#fef3c7",
          200: "#fde68a",
          500: "#f59e0b",
          600: "#d97706",
          700: "#b45309",
        },
        danger: {
          50: "#fef2f2",
          100: "#fee2e2",
          200: "#fecaca",
          500: "#ef4444",
          600: "#dc2626",
          700: "#b91c1c",
        },
        canvas: "rgb(var(--surface) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["Inter", "Tajawal", "system-ui", "sans-serif"],
        display: ["'Plus Jakarta Sans'", "Inter", "Tajawal", "system-ui", "sans-serif"],
        arabic: ["Tajawal", "Inter", "sans-serif"],
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
      },
      letterSpacing: {
        tightish: "-0.011em",
        tighter2: "-0.02em",
      },
      borderRadius: {
        lg: "0.85rem",
        xl: "1.1rem",
        "2xl": "1.5rem",
        "3xl": "2rem",
        "4xl": "2.75rem",
      },
      boxShadow: {
        soft: "0 6px 24px -10px rgb(var(--shadow) / 0.22)",
        card: "0 2px 16px -6px rgb(var(--shadow) / 0.12)",
        raised: "0 18px 48px -16px rgb(var(--shadow) / 0.28)",
        glow: "0 0 0 4px rgb(var(--ring) / 0.16)",
        "inner-line": "inset 0 0 0 1px rgb(var(--line) / 1)",
      },
      backgroundImage: {
        "brand-grad": "linear-gradient(135deg, #1266d8 0%, #2f7df2 45%, #38bdf8 100%)",
        "brand-soft": "linear-gradient(160deg, rgb(var(--surface-1)) 0%, rgb(var(--surface-2)) 100%)",
        "sheen": "linear-gradient(110deg, transparent 30%, rgb(255 255 255 / 0.35) 50%, transparent 70%)",
      },
      keyframes: {
        "fade-in": { "0%": { opacity: "0", transform: "translateY(8px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
        "fade-up": { "0%": { opacity: "0", transform: "translateY(16px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
        "scale-in": { "0%": { opacity: "0", transform: "scale(0.96)" }, "100%": { opacity: "1", transform: "scale(1)" } },
        "pulse-ring": { "0%": { boxShadow: "0 0 0 0 rgba(239,68,68,0.5)" }, "70%": { boxShadow: "0 0 0 10px rgba(239,68,68,0)" }, "100%": { boxShadow: "0 0 0 0 rgba(239,68,68,0)" } },
        "scan-line": { "0%": { top: "0%" }, "100%": { top: "100%" } },
        shimmer: { "100%": { transform: "translateX(100%)" } },
        float: { "0%,100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-6px)" } },
        "gradient-pan": { "0%,100%": { backgroundPosition: "0% 50%" }, "50%": { backgroundPosition: "100% 50%" } },
      },
      animation: {
        "fade-in": "fade-in 0.4s ease-out both",
        "fade-up": "fade-up 0.5s cubic-bezier(0.16,1,0.3,1) both",
        "scale-in": "scale-in 0.25s cubic-bezier(0.16,1,0.3,1) both",
        "pulse-ring": "pulse-ring 1.6s infinite",
        "scan-line": "scan-line 2s linear infinite",
        shimmer: "shimmer 1.6s infinite",
        float: "float 5s ease-in-out infinite",
        "gradient-pan": "gradient-pan 8s ease infinite",
      },
    },
  },
  plugins: [],
};
