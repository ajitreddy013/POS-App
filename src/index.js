import React from 'react';
import ReactDOM from 'react-dom/client';
import './App.css';
import App from './App';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';

// On Android, enforce an opaque cream status bar with dark icons so it never
// bleeds into the app content.
if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
  StatusBar.setOverlaysWebView({ overlay: false });
  StatusBar.setBackgroundColor({ color: '#EDE4CA' });
  StatusBar.setStyle({ style: Style.Light });
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
