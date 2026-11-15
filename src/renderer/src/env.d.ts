/// <reference types="vite/client" />

declare module '*/astryx-themes.js' {
  import type { DefinedTheme } from '@astryxdesign/core/theme';
  export const themes: Record<string, DefinedTheme>;
  export const defaultThemeSlug: string;
}
