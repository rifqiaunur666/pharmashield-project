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
          DEFAULT: '#c8f93a',
          400: '#d7fa65',
          500: '#c8f93a',
          600: '#b1e523',
          dark: '#0c1004',
          glow: 'rgba(200, 249, 58, 0.25)',
        },
        dark: {
          bg: '#0c0e12',
          surface: '#12151c',
          card: '#161922',
          cardHover: '#1c202c',
          border: '#242835',
          borderLight: 'rgba(255, 255, 255, 0.08)',
          muted: '#8e96a4',
          subtle: '#555b6a',
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