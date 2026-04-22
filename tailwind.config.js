/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Space Grotesk", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Mono", "monospace"],
      },
      colors: {
        iota: {
          50:  "#f0f9ff",
          100: "#e0f2fe",
          200: "#bae6fd",
          300: "#7dd3fc",
          400: "#38bdf8",
          500: "#0ea5e9",
          600: "#0284c7",
          700: "#0369a1",
          800: "#075985",
          900: "#0c4a6e",
          950: "#010a15",
        },
      },
      animation: {
        "bio-pulse":   "bioPulse 1.6s ease-out infinite",
        "scan-sweep":  "scanSweep 1.4s ease-in-out infinite",
        "btn-shimmer": "btnShimmer 3.5s ease-in-out infinite 1.2s",
        "check-bounce":"checkBounce 0.35s cubic-bezier(0.34,1.56,0.64,1)",
        "banner-pop":  "bannerPop 0.22s cubic-bezier(0.4,0,0.2,1)",
        "slide-in":    "slideIn 0.22s cubic-bezier(0.4,0,0.2,1)",
        "aurora":      "aurora 14s ease-in-out infinite alternate",
        "fade-in":     "fadeIn 0.25s ease-out",
      },
    },
  },
  plugins: [],
};
