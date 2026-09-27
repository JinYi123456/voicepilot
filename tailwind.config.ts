import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#06070c",
        panel: "#0b0d15",
        line: "#1c2033",
        accent: "#2ee6a8",
        accent2: "#8b7cff",
        warn: "#f0b429",
        danger: "#ff6b6b",
      },
      keyframes: {
        "card-in": {
          "0%": { opacity: "0", transform: "translateY(28px) scale(0.96)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        "pulse-ring": {
          "0%": { boxShadow: "0 0 0 0 rgba(46, 230, 168, 0.45)" },
          "70%": { boxShadow: "0 0 0 14px rgba(46, 230, 168, 0)" },
          "100%": { boxShadow: "0 0 0 0 rgba(46, 230, 168, 0)" },
        },
      },
      animation: {
        "card-in": "card-in 0.55s cubic-bezier(0.16, 1, 0.3, 1) both",
        "pulse-ring": "pulse-ring 1.6s ease-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
