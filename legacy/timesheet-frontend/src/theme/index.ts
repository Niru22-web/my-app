export interface Theme {
  colors: {
    primary: Record<string, string>;
    secondary: Record<string, string>;
    success: Record<string, string>;
    warning: Record<string, string>;
    danger: Record<string, string>;
    info: Record<string, string>;
    gray: Record<string, string>;
    muted: Record<string, string>;
    background: {
      primary: string;
      secondary: string;
      tertiary: string;
    };
    text: {
      primary: string;
      secondary: string;
      tertiary: string;
      inverse: string;
    };
    border: {
      primary: string;
      secondary: string;
      focus: string;
    };
  };
  spacing: Record<string, string>;
  borderRadius: Record<string, string>;
  typography: {
    fontFamily: {
      sans: string[];
      mono: string[];
    };
    fontSize: Record<string, string>;
    fontWeight: Record<string, string>;
    lineHeight: Record<string, string>;
  };
  shadows: Record<string, string>;
  transitions: Record<string, string>;
  breakpoints: Record<string, string>;
}

export const lightTheme: Theme = {
  colors: {
    primary: {
      50: '#f5f6ff',
      100: '#ebedff',
      200: '#dce0ff',
      300: '#b3b7ff',
      400: '#8085ff',
      500: '#5b5ffb',
      600: '#4b4fd8',
      700: '#393db3',
      800: '#262980',
      900: '#171a53',
      950: '#0a0b29',
    },
    secondary: {
      50: '#f8fafc',
      100: '#f1f5f9',
      200: '#e2e8f0',
      300: '#cbd5e1',
      400: '#94a3b8',
      500: '#64748b',
      600: '#475569',
      700: '#334155',
      800: '#1e293b',
      900: '#0f172a',
      950: '#020617',
    },
    success: {
      50: '#f0fdf4',
      100: '#dcfce7',
      200: '#bbf7d0',
      300: '#86efac',
      400: '#4ade80',
      500: '#22c55e',
      600: '#16a34a',
      700: '#15803d',
      800: '#166534',
      900: '#14532d',
      950: '#052e16',
    },
    warning: {
      50: '#fffbeb',
      100: '#fef3c7',
      200: '#fde68a',
      300: '#fcd34d',
      400: '#fbbf24',
      500: '#f59e0b',
      600: '#d97706',
      700: '#b45309',
      800: '#92400e',
      900: '#78350f',
      950: '#451a03',
    },
    danger: {
      50: '#fef2f2',
      100: '#fee2e2',
      200: '#fecaca',
      300: '#fca5a5',
      400: '#f87171',
      500: '#ef4444',
      600: '#dc2626',
      700: '#b91c1c',
      800: '#991b1b',
      900: '#7f1d1d',
      950: '#450a0a',
    },
    info: {
      50: '#f0f9ff',
      100: '#e0f2fe',
      200: '#bae6fd',
      300: '#7dd3fc',
      400: '#38bdf8',
      500: '#0ea5e9',
      600: '#0284c7',
      700: '#0369a1',
      800: '#075985',
      900: '#0c4a6e',
      950: '#082f49',
    },
    gray: {
      50: '#f9fafb',
      100: '#f3f4f6',
      200: '#e5e7eb',
      300: '#d1d5db',
      400: '#9ca3af',
      500: '#6b7280',
      600: '#4b5563',
      700: '#374151',
      800: '#1f2937',
      900: '#111827',
      950: '#030712',
    },
    muted: {
      50: '#f8fafc',
      100: '#f1f5f9',
      200: '#e2e8f0',
      300: '#cbd5e1',
      400: '#94a3b8',
      500: '#64748b',
      600: '#475569',
      700: '#334155',
      800: '#1e293b',
      900: '#0f172a',
    },
    background: {
      primary: '#ffffff',
      secondary: '#f8fafc',
      tertiary: '#f1f5f9',
    },
    text: {
      primary: '#111827',
      secondary: '#4b5563',
      tertiary: '#6b7280',
      inverse: '#ffffff',
    },
    border: {
      primary: '#e5e7eb',
      secondary: '#d1d5db',
      focus: '#5b5ffb',
    },
  },
  spacing: {
    xs: '0.25rem',    // 4px
    sm: '0.5rem',     // 8px
    md: '1rem',       // 16px
    lg: '1.5rem',     // 24px
    xl: '2rem',       // 32px
    '2xl': '3rem',    // 48px
    '3xl': '4rem',    // 64px
    '4xl': '6rem',    // 96px
    '5xl': '8rem',    // 128px
  },
  borderRadius: {
    none: '0',
    sm: '0.25rem',    // 4px
    md: '0.375rem',   // 6px
    lg: '0.5rem',     // 8px
    xl: '0.75rem',    // 12px
    '2xl': '1rem',    // 16px
    '3xl': '1.5rem',  // 24px
    full: '9999px',
  },
  typography: {
    fontFamily: {
      sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'Monaco', 'monospace'],
    },
    fontSize: {
      xs: '0.75rem',
      sm: '0.875rem',
      base: '1rem',
      lg: '1.125rem',
      xl: '1.25rem',
      '2xl': '1.5rem',
      '3xl': '1.875rem',
      '4xl': '2.25rem',
      '5xl': '3rem',
      '6xl': '3.75rem',
    },
    fontWeight: {
      thin: '100',
      extralight: '200',
      light: '300',
      normal: '400',
      medium: '500',
      semibold: '600',
      bold: '700',
      extrabold: '800',
      black: '900',
    },
    lineHeight: {
      none: '1',
      tight: '1.25',
      snug: '1.375',
      normal: '1.5',
      relaxed: '1.625',
      loose: '2',
    },
  },
  shadows: {
    sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    soft: '0 2px 15px -3px rgba(0, 0, 0, 0.07), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
    medium: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    large: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
    elevated: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
    xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
    '2xl': '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
    inner: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.06)',
  },
  transitions: {
    fast: '150ms ease-in-out',
    normal: '250ms ease-in-out',
    slow: '350ms ease-in-out',
    colors: '150ms ease-in-out',
    transform: '200ms ease-in-out',
    opacity: '150ms ease-in-out',
  },
  breakpoints: {
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1280px',
    '2xl': '1536px',
  },
};

export const darkTheme: Theme = {
  ...lightTheme,
  colors: {
    ...lightTheme.colors,
    background: {
      primary: '#080F1D',
      secondary: '#0E1626',
      tertiary: '#151F32',
    },
    text: {
      primary: '#FFFFFF',
      secondary: '#CBD5E1',
      tertiary: '#94A3B8',
      inverse: '#080F1D',
    },
    border: {
      primary: 'rgba(255,255,255,0.06)',
      secondary: 'rgba(255,255,255,0.12)',
      focus: '#5b5ffb',
    },
    secondary: {
      50: '#080F1D',
      100: '#0E1626',
      200: '#151F32',
      300: '#1E2C44',
      400: '#94A3B8',
      500: '#CBD5E1',
      600: '#FFFFFF',
      700: '#FFFFFF',
      800: '#FFFFFF',
      900: '#FFFFFF',
      950: '#FFFFFF',
    },
    gray: {
      50: '#080F1D',
      100: '#0E1626',
      200: '#151F32',
      300: '#1E2C44',
      400: '#94A3B8',
      500: '#CBD5E1',
      600: '#FFFFFF',
      700: '#FFFFFF',
      800: '#FFFFFF',
      900: '#FFFFFF',
      950: '#FFFFFF',
    },
  },
};

export type ThemeMode = 'light' | 'dark' | 'system';

export const themes = {
  light: lightTheme,
  dark: darkTheme,
};

export default lightTheme;
