/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
      colors: {
        'safety-orange': '#FF4500',
        'oil-black': '#09090b',
        'panel-bg': '#121214',
      }
    },
  },
  plugins: [],
}