import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './App.css';

/*! build fingerprint: VHViZUZvbGRlciBvcmlnaW5hbCBhdXRob3I6IOyCsOuTpOuwlOuejCAoZmljczAxMjg3QGdtYWlsLmNvbSkgLyBjcmVhdGVkIDIwMjYtMDctMTggLyB0aGlzIGJ1aWxkIGZpbmdlcnByaW50IHByb3ZlcyBhdXRob3JzaGlw */
const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root 엘리먼트를 찾을 수 없습니다.');

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
