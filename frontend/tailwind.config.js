/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        forest: {
          950: 'rgb(var(--forest-950) / <alpha-value>)',
          900: 'rgb(var(--forest-900) / <alpha-value>)',
          850: 'rgb(var(--forest-850) / <alpha-value>)',
          800: 'rgb(var(--forest-800) / <alpha-value>)',
          700: 'rgb(var(--forest-700) / <alpha-value>)',
        },
        mint: 'rgb(var(--mint) / <alpha-value>)',
        cream: 'rgb(var(--cream) / <alpha-value>)',
        panel: 'rgb(var(--panel) / <alpha-value>)',
        'panel-head': 'rgb(var(--panel-head) / <alpha-value>)',
        'panel-head-text': 'rgb(var(--panel-head-text) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        'ink-soft': 'rgb(var(--ink-soft) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        cell: 'rgb(var(--cell) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
