/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: 'rgb(var(--color-primary-rgb) / <alpha-value>)',
        'primary-dark': 'rgb(var(--color-primary-dark-rgb) / <alpha-value>)',
        'primary-soft': 'rgb(var(--color-primary-soft-rgb) / <alpha-value>)',
        'primary-50': 'rgb(var(--color-primary-50-rgb) / <alpha-value>)',
        'primary-100': 'rgb(var(--color-primary-100-rgb) / <alpha-value>)',
        'primary-200': 'rgb(var(--color-primary-200-rgb) / <alpha-value>)',
      }
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
}