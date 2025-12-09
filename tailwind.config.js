import { plugin } from 'postcss';

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./src/**/*.{html,js,svelte,ts}', './node_modules/@skeletonlabs/skeleton/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {},
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography'),
    plugin(function({ addBase, theme }) {
      addBase({
        ':root': {
          '--theme-font-family-base': 'inter, sans-serif',
          '--theme-font-family-heading': 'inter, sans-serif',
          '--theme-font-color-base': '0 0 0',
          '--theme-font-color-dark': '255 255 255',
          '--theme-rounded-base': '0.25rem',
          '--theme-rounded-container': '0.5rem',
          '--theme-border-base': '1px solid',
        },
      });
    }),
  ],
}
