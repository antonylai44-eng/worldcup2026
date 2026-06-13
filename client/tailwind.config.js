/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        pitch: "#0b3b2e",
        line: "#d8efe7",
        signal: "#e7b10a",
        ink: "#14201d"
      }
    }
  },
  plugins: []
};
