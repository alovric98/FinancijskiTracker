import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles/tokens.css'
import './styles/app.css'
import App from './App.jsx'

ReactDOM.createRoot(
  document.getElementById('wb-finance-tracker') || document.getElementById('root')
).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
