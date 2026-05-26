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
    },
  },
  plugins: [],
}
