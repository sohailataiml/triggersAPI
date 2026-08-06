import type { Config } from 'tailwindcss';

/**
 * Stripe/Linear-restrained dark theme. Palette and status colors are driven by
 * CSS variables (see styles.css) so the whole system stays token-based.
 */
const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'hsl(var(--bg) / <alpha-value>)',
        surface: 'hsl(var(--surface) / <alpha-value>)',
        'surface-2': 'hsl(var(--surface-2) / <alpha-value>)',
        border: 'hsl(var(--border) / <alpha-value>)',
        'border-strong': 'hsl(var(--border-strong) / <alpha-value>)',
        text: 'hsl(var(--text) / <alpha-value>)',
        muted: 'hsl(var(--muted) / <alpha-value>)',
        faint: 'hsl(var(--faint) / <alpha-value>)',
        accent: 'hsl(var(--accent) / <alpha-value>)',
        'accent-soft': 'hsl(var(--accent) / 0.14)',
        // 7-stage status system — mirrored in lib/status.ts
        ingested: 'hsl(var(--st-ingested) / <alpha-value>)',
        pending: 'hsl(var(--st-pending) / <alpha-value>)',
        leased: 'hsl(var(--st-leased) / <alpha-value>)',
        ack: 'hsl(var(--st-ack) / <alpha-value>)',
        retry: 'hsl(var(--st-retry) / <alpha-value>)',
        dead: 'hsl(var(--st-dead) / <alpha-value>)',
        replay: 'hsl(var(--st-replay) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      borderRadius: {
        lg: '12px',
        xl: '16px',
      },
      boxShadow: {
        card: '0 1px 0 0 hsl(var(--border) / 0.6), 0 8px 24px -12px rgb(0 0 0 / 0.6)',
        pop: '0 12px 40px -8px rgb(0 0 0 / 0.7)',
        glow: '0 0 0 1px hsl(var(--accent) / 0.4), 0 0 24px -6px hsl(var(--accent) / 0.5)',
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 hsl(var(--tw-ring-color) / 0.45)' },
          '70%': { boxShadow: '0 0 0 8px hsl(var(--tw-ring-color) / 0)' },
          '100%': { boxShadow: '0 0 0 0 hsl(var(--tw-ring-color) / 0)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 220ms cubic-bezier(0.16,1,0.3,1)',
        'pulse-ring': 'pulse-ring 1.6s ease-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
