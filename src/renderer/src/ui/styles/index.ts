import { appCss } from './app';
import { stageCss } from './stage';

let installed = false;

/**
 * Installs the app's custom styling once, as a constructed stylesheet.
 * The rules attach to `data-am-*` attributes set on Astryx components and use Astryx tokens only.
 * See docs/hackathon/design/polish-brief.md ("How to build custom visuals and still be pure Astryx").
 */
export function installStyles(): void {
  if (installed || typeof document === 'undefined' || typeof CSSStyleSheet === 'undefined') return;
  installed = true;
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(`${appCss}\n${stageCss}`);
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
}
