import React from 'react';
import { createRoot } from 'react-dom/client';
import { PopupApp } from './App';
import './popup.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');
createRoot(root).render(
  <React.StrictMode>
    <PopupApp />
  </React.StrictMode>
);
