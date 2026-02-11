import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        pine: {
          50: "#f2f7f5",
          100: "#dfece6",
          200: "#c8ddd3",
          300: "#a4c6b6",
          500: "#2f6a5b",
          700: "#214f43",
          900: "#173c33"
        }
      },
      boxShadow: {
        card: "0 10px 32px -18px rgba(47, 106, 91, 0.45)"
      },
      fontFamily: {
        display: ["\"Fraunces\"", "Georgia", "serif"],
        body: ["\"DM Sans\"", "Segoe UI", "sans-serif"]
      }
    }
  },
  plugins: []
};

export default config;
