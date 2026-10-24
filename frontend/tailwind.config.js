/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: {
          DEFAULT: '#FAF8F5',
          subtle: '#F4F1EA',
          muted: '#EFECE4',
        },
        surface: {
          DEFAULT: '#FFFFFF',
          elevated: '#FFFFFF',
          muted: '#FCFBF9',
        },
        sidebar: {
          DEFAULT: '#141716',
          border: '#232826',
          hover: '#1E2320',
          active: '#272E2A',
        },
        ink: {
          950: '#111413',
          900: '#181C1A',
          800: '#2E3431',
          700: '#454C48',
          600: '#5C6560',
          500: '#757F79',
          400: '#949E99',
          300: '#B8C0BC',
          200: '#D9DEDC',
          100: '#EAECEB',
          50: '#F5F7F6',
        },
        forest: {
          DEFAULT: '#004532',
          dark: '#003325',
          light: '#0E6247',
          hover: '#0A523B',
          50: '#EBF5F1',
          100: '#D3EAE0',
          200: '#A7D5C1',
        },
        amberBrand: {
          DEFAULT: '#C2410C',
          dark: '#9A3412',
          light: '#EA580C',
          50: '#FFF7ED',
          100: '#FFEDD5',
        },
        critical: {
          border: '#DC2626',
          bg: '#FEF2F2',
          text: '#991B1B',
          subtle: '#FCA5A5',
        },
        warning: {
          border: '#EA580C',
          bg: '#FFF7ED',
          text: '#9A3412',
          subtle: '#FDBA74',
        },
        caution: {
          border: '#D97706',
          bg: '#FFFBEB',
          text: '#92400E',
          subtle: '#FCD34D',
        },
        info: {
          border: '#2563EB',
          bg: '#EFF6FF',
          text: '#1E40AF',
          subtle: '#93C5FD',
        }
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      boxShadow: {
        'subtle': '0 1px 2px 0 rgba(0, 0, 0, 0.04)',
        'card': '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.05)',
        'elevated': '0 4px 6px -1px rgba(0, 0, 0, 0.07), 0 2px 4px -2px rgba(0, 0, 0, 0.05)',
      },
    },
  },
  plugins: [],
}
