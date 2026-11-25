/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', "system-ui", "sans-serif"],
        display: ['"Fraunces"', "Georgia", "serif"],
        mono: ['"JetBrains Mono"', "monospace"],
      },
      colors: {
        canvas: "#F6F3EC",
        surface: "#FFFFFF",
        sand: "#EDE8DC",
        ink: "#16181D",
        muted: "#5C6270",
        rule: "#DFD9CC",
        saffron: {
          DEFAULT: "#C84B1E",
          dark: "#A33A14",
          soft: "#FCEEE8",
        },
        teal: {
          DEFAULT: "#0E6B62",
          dark: "#095049",
          soft: "#E5F4F1",
        },
      },
    },
  },
  plugins: [],
};
