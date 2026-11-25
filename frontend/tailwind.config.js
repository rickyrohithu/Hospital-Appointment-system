/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        serif: ['Newsreader', 'Georgia', 'serif'],
        sans: ['Manrope', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        paper: {
          DEFAULT: '#F7F5F0',
          card: '#FFFFFF',
          elevated: '#FCFBF8',
          border: '#E5E0D6',
        },
        obsidian: {
          DEFAULT: '#0B100E',
          card: '#121916',
          elevated: '#17201C',
          border: '#212D27',
        },
        ink: {
          DEFAULT: '#0E1512',
          muted: '#57625C',
          subtle: '#8A948E',
        },
        hospital: {
          DEFAULT: '#0F5C4D',
          hover: '#0B473B',
          soft: '#E7F1EE',
          dark: '#2F9E84',
        },
        sand: {
          DEFAULT: '#B5945B',
          soft: '#F5EFE2',
        },
      },
      borderRadius: {
        panel: '14px',
      },
    },
  },
  plugins: [],
}
