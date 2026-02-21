/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        base: '#e0e5ec',
        accent: '#6c63ff',
        accent2: '#2ec4b6',
      },
      boxShadow: {
        neu: '9px 9px 18px #a3b1c6, -9px -9px 18px #ffffff',
        'neu-sm': '6px 6px 12px #a3b1c6, -6px -6px 12px #ffffff',
        'neu-inset': 'inset 6px 6px 12px #a3b1c6, inset -6px -6px 12px #ffffff',
        glass: '0 18px 40px rgba(15, 23, 42, 0.15)',
      },
      borderRadius: {
        '2xl': '20px',
        '3xl': '28px',
      },
      animation: {
        'fade-up': 'fadeUp 0.6s ease-out',
        'gradient-x': 'gradient-x 15s ease infinite',
      },
      keyframes: {
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'gradient-x': {
          '0%, 100%': {
            'background-size': '200% 200%',
            'background-position': 'left center',
          },
          '50%': {
            'background-size': '200% 200%',
            'background-position': 'right center',
          },
        },
      },
    },
  },
  plugins: [],
}
