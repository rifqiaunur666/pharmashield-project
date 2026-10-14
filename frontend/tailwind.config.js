/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      screens: {
        'xs': '420px',
      },
      fontFamily: {
        sans: ['var(--font-manrope)', 'system-ui', 'sans-serif'],
      },
      colors: {
        neon: {
          DEFAULT: '#10b981',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          dark: '#0f172a',
          glow: 'rgba(16, 185, 129, 0.2)',
        },
        dark: {
          bg: '#0c0e12',
          surface: '#12151c',
          card: '#161922',
          cardHover: '#1c202c',
          border: '#242835',
          borderLight: 'rgba(255, 255, 255, 0.08)',
          muted: '#cbd5e1',
          subtle: '#94a3b8',
        },
        pharma: {
          black:  '#0c0e12',
          dark:   '#161922',
          mid:    '#8e96a4',
          border: '#242835',
          light:  '#1c202c',
          white:  '#ffffff',
        },
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.25rem',
      },
      animation: {
        'fade-in': 'fade-in 0.35s cubic-bezier(0.22, 1, 0.36, 1) both',
        'pulse-glow': 'pulse-glow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 15px rgba(200, 249, 58, 0.3)' },
          '50%': { boxShadow: '0 0 5px rgba(200, 249, 58, 0.1)' },
        },
      },
    },
  },
  plugins: [],
};