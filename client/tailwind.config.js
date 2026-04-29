/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#f0f4ff',
          100: '#dce7ff',
          200: '#bcceff',
          300: '#8aabff',
          400: '#567eff',
          500: '#2d54fc',
          600: '#1a35f0',
          700: '#1527d6',
          800: '#1722ad',
          900: '#192188',
          950: '#111452',
        },
      },
    },
  },
  plugins: [],
};
