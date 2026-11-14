import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
import { Theme } from '@astryxdesign/core/theme';
import { themes, defaultThemeSlug } from './theme';
import { App, initApp } from './App';
import { ErrorBoundary } from './ErrorBoundary';
import { useStore } from './api/store';

initApp();

function Root() {
  const mode = useStore((s) => s.settings?.appearance ?? 'system');
  return (
    <Theme theme={themes[defaultThemeSlug]!} mode={mode}>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </Theme>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
