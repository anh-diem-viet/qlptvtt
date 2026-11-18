/** @type {import('tailwindcss').Config} */
// Bố cục theo dự án mẫu web_an_toan_blockchain (header + sidebar + card), giữ tone màu sáng của giao diện cũ
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Be Vietnam Pro"', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#eef7ff',
          100: '#d9edff',
          200: '#bcdfff',
          300: '#8ecbff',
          400: '#4fb0ff',
          500: '#2f8fe0',
          600: '#1b6fb8',
          700: '#155a96',
        },
        gold: {
          100: '#fff3d6',
          300: '#ffd54f',
          400: '#ffc629',
          500: '#ffb300',
          600: '#e08e00',
        },
        ink: {
          DEFAULT: '#3e332a',
          soft: '#6b5b4b',
        },
      },
      boxShadow: {
        card: '0 10px 30px rgba(30, 60, 90, 0.10)',
        brand: '0 6px 16px rgba(47, 143, 224, 0.35)',
      },
      backgroundImage: {
        'gradient-brand': 'linear-gradient(135deg, #4fb0ff 0%, #2f8fe0 60%, #1b6fb8 100%)',
        'gradient-gold': 'linear-gradient(135deg, #ffd54f 0%, #ffb300 100%)',
      },
    },
  },
  plugins: [],
}
