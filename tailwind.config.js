/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef2ff',
          100: '#dbeafe',
          500: '#2563eb',
          600: '#1d4ed8',
        },
        td: {
          bg: '#fffdfa',
          text: '#111111',
          muted: '#666666',
          line: '#e6e6e6',
          surface: '#ffffff',
          soft: '#f5f5f5',
        },
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', '"Noto Sans SC"', '"PingFang SC"', 'sans-serif'],
        sans: ['"Noto Sans SC"', '"PingFang SC"', '"Microsoft YaHei"', 'sans-serif'],
      },
      boxShadow: {
        card: '0 10px 24px rgba(0, 0, 0, 0.08)',
        thin: '0 4px 10px rgba(0, 0, 0, 0.06)',
      },
    },
  },
  plugins: [],
}
