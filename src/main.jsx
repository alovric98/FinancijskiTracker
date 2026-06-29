import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles/tokens.css'
import './styles/app.css'
import App from './App.jsx'

const mountEl =
  document.getElementById('wb-finance-tracker') ||
  document.getElementById('root')

// REST root + nonce dolaze iz data-atributa na mount divu. Data-atributi prežive
// WP/Elementor sanitizaciju (za razliku od inline <script>, koji zna biti izbačen).
// Fallback na window.ftSettings ako je negdje postavljen tako.
if (mountEl && mountEl.dataset.ftRoot && !window.ftSettings) {
  window.ftSettings = {
    root: mountEl.dataset.ftRoot,
    nonce: mountEl.dataset.ftNonce || '',
  }
}

ReactDOM.createRoot(mountEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
