/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/domains/**/*.{js,ts,jsx,tsx,mdx}',  // Domain-driven architecture components
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontSize: {
        // Design system font sizes using CSS variables
        'xs': ['var(--font-size-xs)', { lineHeight: '1.3' }],
        'sm': ['var(--font-size-sm)', { lineHeight: '1.4' }],
        'base': ['var(--font-size-base)', { lineHeight: '1.5' }],
        'lg': ['var(--font-size-lg)', { lineHeight: '1.5' }],
        'xl': ['var(--font-size-xl)', { lineHeight: '1.4' }],
        '2xl': ['var(--font-size-2xl)', { lineHeight: '1.3' }],
        '3xl': ['var(--font-size-3xl)', { lineHeight: '1.2' }],
        '4xl': ['var(--font-size-4xl)', { lineHeight: '1.1' }],
      },
      spacing: {
        // Design system spacing using CSS variables
        '1': 'var(--space-1)',
        '2': 'var(--space-2)',
        '3': 'var(--space-3)',
        '4': 'var(--space-4)',
        '5': 'var(--space-5)',
        '6': 'var(--space-6)',
        '8': 'var(--space-8)',
        '10': 'var(--space-10)',
        '12': 'var(--space-12)',
        '16': 'var(--space-16)',
        '20': 'var(--space-20)',
        '24': 'var(--space-24)',
        // Layout-specific spacing
        'sidebar': 'var(--sidebar-width)',
        'sidebar-collapsed': 'var(--sidebar-width-collapsed)',
        'header': 'var(--header-height)',
        // Component spacing
        'card-padding': 'var(--card-padding)',
        'card-gap': 'var(--card-gap)',
        'section-gap': 'var(--section-gap)',
      },
      height: {
        // Component heights using design tokens
        'button-sm': 'var(--button-height-sm)',
        'button-md': 'var(--button-height-md)',
        'button-lg': 'var(--button-height-lg)',
        'input': 'var(--input-height)',
        'header': 'var(--header-height)',
      },
      width: {
        // Layout widths using design tokens
        'sidebar': 'var(--sidebar-width)',
        'sidebar-collapsed': 'var(--sidebar-width-collapsed)',
      },
      maxWidth: {
        'content': 'var(--content-max-width)',
      },
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        // Semantic Action Button Colors
        "action-primary": {
          DEFAULT: "hsl(var(--action-primary))",
          foreground: "hsl(var(--action-primary-foreground))",
          hover: "hsl(var(--action-primary-hover))",
        },
        "action-view": {
          DEFAULT: "hsl(var(--action-view))",
          foreground: "hsl(var(--action-view-foreground))",
          hover: "hsl(var(--action-view-hover))",
        },
        "action-secondary": {
          DEFAULT: "hsl(var(--action-secondary))",
          foreground: "hsl(var(--action-secondary-foreground))",
          hover: "hsl(var(--action-secondary-hover))",
        },
        // Semantic Badge Colors
        "badge-invoice": {
          DEFAULT: "hsl(var(--badge-invoice))",
          foreground: "hsl(var(--badge-invoice-foreground))",
        },
        "badge-expense": {
          DEFAULT: "hsl(var(--badge-expense))",
          foreground: "hsl(var(--badge-expense-foreground))",
        },
        // Semantic Status Colors
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        danger: {
          DEFAULT: "hsl(var(--danger))",
          foreground: "hsl(var(--danger-foreground))",
        },
        info: {
          DEFAULT: "hsl(var(--info))",
          foreground: "hsl(var(--info-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        chart: {
          "1": "hsl(var(--chart-1))",
          "2": "hsl(var(--chart-2))",
          "3": "hsl(var(--chart-3))",
          "4": "hsl(var(--chart-4))",
          "5": "hsl(var(--chart-5))",
        },
        // Semantic Record System Colors
        "record-layer": {
          "1": "hsl(var(--record-layer-1))",
          "2": "hsl(var(--record-layer-2))",
          "3": "hsl(var(--record-layer-3))",
        },
        "record-hover": "hsl(var(--record-hover))",
        "record-title": {
          DEFAULT: "hsl(var(--record-title))",
          hover: "hsl(var(--record-title-hover))",
        },
        "record-supporting": {
          DEFAULT: "hsl(var(--record-supporting))",
          light: "hsl(var(--record-supporting-light))",
        },
        "record-meta": "hsl(var(--record-meta))",
        "record-border": {
          DEFAULT: "hsl(var(--record-border))",
          hover: "hsl(var(--record-border-hover))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [],
}