/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef4ff',
          100: '#dfe9ff',
          500: '#3b82f6',
        },
        ink: {
          900: '#0f172a',
        },
      },
      fontFamily: {
        sans: ['"Noto Sans SC"', '"PingFang SC"', '"Microsoft YaHei"', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 16px 44px rgba(15, 23, 42, 0.12)',
      },
      backgroundImage: {
        mesh:
          'radial-gradient(circle at 12% 18%, rgba(59,130,246,0.2), transparent 36%), radial-gradient(circle at 88% 82%, rgba(20,184,166,0.18), transparent 40%)',
      },
    },
  },
  plugins: [],
}
