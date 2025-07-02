/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/renderer/**/*.{html,tsx}", "./src/renderer/index.html"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        rail: "#1f1f1f",
      },
    },
  },
  plugins: [require("@tailwindcss/line-clamp")],
}; 