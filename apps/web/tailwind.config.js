module.exports = {
  content: [
    "./app/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
    "./lib/**/*.{js,jsx}"
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: "#eef2ff",
          100: "#e0e7ff",
          200: "#c7d2fe",
          300: "#a5b4fc",
          400: "#818cf8",
          500: "#6366f1",
          600: "#4f46e5",
          700: "#4338ca",
          800: "#3730a3",
          900: "#312e81"
        },
        accent: {
          500: "#f59e0b",
          600: "#d97706"
        },
        neutral: {
          900: "#0f172a",
          700: "#1f2937",
          500: "#64748b",
          300: "#cbd5f5",
          100: "#f8fafc"
        }
      }
    }
  },
  plugins: []
};
