import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from '../../contexts/auth-context';
import { SidePanelApp } from './app';
import '../../styles/main.css';

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <AuthProvider>
        <SidePanelApp />
      </AuthProvider>
    </React.StrictMode>
  );
}
