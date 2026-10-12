import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { useApp } from './store';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
  // a Done/Snooze tapped on a notification changed data: refresh open windows
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type === 'openhabit:refresh') useApp.getState().refresh().catch(() => {});
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
