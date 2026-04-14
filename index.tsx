import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './src/App';
import { ensureDynamicFontFaces, getInitialFontSettingsFromLocalStorage } from './src/utils/fontSettings';
import 'github-markdown-css/github-markdown.css';
import 'katex/dist/katex.min.css';
import './index.css';
import './src/styles/editor.css';
import './src/styles/preview.css';
import './src/styles/components.css';

// Ensure process.env exists for some libraries
if (typeof window !== 'undefined' && !window.process) {
  // @ts-ignore
  window.process = { 
    env: { 
      NODE_ENV: import.meta.env.MODE || 'production'
    } 
  };
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

async function bootstrap() {
  try {
    await ensureDynamicFontFaces(getInitialFontSettingsFromLocalStorage());
  } catch {
    // Fallback silently - App mount will retry font registration.
  }

  const root = ReactDOM.createRoot(rootElement!);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

void bootstrap();
