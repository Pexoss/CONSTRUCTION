/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  darkMode: 'class', // Enable class-based dark mode
  theme: {
    extend: {
      maxWidth: {
        /** ~1536px — área útil ampla em desktop, 100% no mobile */
        app: "96rem",
      },
      fontSize: {
        /** ~10px no padrão — escala com rem (acessibilidade) */
        "3xs": ["0.625rem", { lineHeight: "0.875rem" }],
        /** ~11px no padrão — escala com rem (acessibilidade) */
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
      },
    },
  },
  plugins: [],
}
