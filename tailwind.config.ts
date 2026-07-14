import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#17211b",
        moss: "#42624a",
        mint: "#dfeee3",
        paper: "#f7f6f1",
        line: "#d9ded2",
        coral: "#b85d4b"
      },
      boxShadow: {
        soft: "0 12px 32px rgba(23, 33, 27, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;

