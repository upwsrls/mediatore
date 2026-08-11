import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

const contenitore = document.getElementById('root');
if (contenitore === null) {
  throw new Error('manca il nodo #root nella pagina');
}

createRoot(contenitore).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
