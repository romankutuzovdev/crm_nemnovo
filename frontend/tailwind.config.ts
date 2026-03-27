import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "rgb(var(--bg) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        "surface-hover": "rgb(var(--surface-hover) / <alpha-value>)",

        text: "rgb(var(--text) / <alpha-value>)",
        "text-secondary": "rgb(var(--text-secondary) / <alpha-value>)",

        border: "rgb(var(--border) / <alpha-value>)",

        primary: "rgb(var(--primary) / <alpha-value>)",
        "primary-hover": "rgb(var(--primary-hover) / <alpha-value>)",

        secondary: "rgb(var(--secondary) / <alpha-value>)",

        success: "rgb(var(--success) / <alpha-value>)",
        error: "rgb(var(--error) / <alpha-value>)",
        warning: "rgb(var(--warning) / <alpha-value>)",

        brandBlue: {
          50: "#EFF1FB",
          100: "#E0E4F8",
          200: "#C3CAF1",
          300: "#A0A9E6",
          400: "#7A86D6",
          500: "#6472BE",
          600: "#5966AE", // основной с логотипа
          700: "#4A5692",
          800: "#3D4777",
          900: "#2D3456",
        },
        brandGold: {
          50: "#FFF7E7",
          100: "#FEECC4",
          200: "#FDD78A",
          300: "#F7C05A",
          400: "#EEB043",
          500: "#E6A438", // основной с логотипа
          600: "#D08F2E",
          700: "#AF7425",
          800: "#8C5B1D",
          900: "#6E4717",
        },
      },
      boxShadow: {
        soft: "0 10px 30px rgba(0,0,0,0.08)",
        card: "0 10px 30px rgba(15,23,42,0.08)",
        glow: "0 0 0 3px rgba(59,130,246,0.15)",
        "glow-dark": "0 0 0 2px rgba(79,124,255,0.2)",
      },
      borderRadius: {
        xl2: "16px",
      },
    },
  },
  plugins: [],
};

export default config;
