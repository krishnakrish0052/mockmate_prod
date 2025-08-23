/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // CLI Theme Colors
        cli: {
          'black': '#0a0a0a',
          'dark': '#1a1a1a',
          'darker': '#0d0d0d',
          'gray': '#333333',
          'light-gray': '#666666',
          'green': '#00ff00',
          'amber': '#ffbf00',
          'golden': '#ffd700',
          'yellow': '#ffff00',
          'cyan': '#00ffff',
          'white': '#ffffff',
        },
        primary: {
          50: '#fffdf0',
          100: '#fffbe6',
          200: '#fff7cc',
          300: '#fff0a3',
          400: '#ffe770',
          500: '#ffd700',
          600: '#e6c200',
          700: '#cc9e00',
          800: '#b38a00',
          900: '#996600',
        },
      },
      fontFamily: {
        'sans': ['Inter', 'ui-sans-serif', 'system-ui'],
        'mono': ['JetBrains Mono', 'Fira Code', 'Consolas', 'Monaco', 'monospace'],
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-in-out',
        'slide-in': 'slideIn 0.3s ease-out',
        'bounce-gentle': 'bounceGentle 2s infinite',
        'typing': 'typing 3.5s steps(30, end), blink-caret 0.75s step-end infinite',
        'blink': 'blink 1s infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
        'pulse-golden': 'pulseGolden 2s ease-in-out infinite',
        'matrix-rain': 'matrixRain 1s linear infinite',
        'terminal-cursor': 'terminalCursor 1s infinite',
        'slide-up': 'slideUp 0.5s ease-out',
        'scale-in': 'scaleIn 0.3s ease-out',
        'float': 'float 3s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideIn: {
          '0%': { transform: 'translateY(-10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.9)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        bounceGentle: {
          '0%, 100%': { transform: 'translateY(-5%)' },
          '50%': { transform: 'translateY(0)' },
        },
        typing: {
          'from': { width: '0' },
          'to': { width: '100%' },
        },
        blink: {
          '0%, 50%': { opacity: '1' },
          '51%, 100%': { opacity: '0' },
        },
        glow: {
          'from': {
            'box-shadow': '0 0 5px #ffd700, 0 0 10px #ffd700, 0 0 15px #ffd700',
          },
          'to': {
            'box-shadow': '0 0 10px #ffd700, 0 0 20px #ffd700, 0 0 30px #ffd700',
          },
        },
        pulseGolden: {
          '0%, 100%': {
            'box-shadow': '0 0 5px rgba(255, 215, 0, 0.5)',
            'border-color': 'rgba(255, 215, 0, 0.5)',
          },
          '50%': {
            'box-shadow': '0 0 20px rgba(255, 215, 0, 0.8), 0 0 30px rgba(255, 215, 0, 0.6)',
            'border-color': 'rgba(255, 215, 0, 1)',
          },
        },
        matrixRain: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' },
        },
        terminalCursor: {
          '0%, 50%': { opacity: '1' },
          '51%, 100%': { opacity: '0' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
      },
      boxShadow: {
        'glow-golden': '0 0 20px rgba(255, 215, 0, 0.5)',
        'glow-golden-lg': '0 0 30px rgba(255, 215, 0, 0.7)',
        'cli-inset': 'inset 0 2px 4px rgba(0, 0, 0, 0.3)',
        'cli-border': '0 0 0 1px rgba(255, 215, 0, 0.3)',
      },
      backdropBlur: {
        'xs': '2px',
      },
      ringColor: {
        DEFAULT: '#00ff00', // Green ring color for terminal theme
        'cli-green': '#00ff00',
      },
      ringOpacity: {
        DEFAULT: '0.1',
        '10': '0.1',
        '20': '0.2',
        '30': '0.3',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography'),
  ],
};
