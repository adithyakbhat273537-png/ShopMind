import React, { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/blue-palette.css'
import App from './App.jsx'
import './styles/accessible-ui.css'

document.documentElement.dataset.theme = 'light'
try { localStorage.removeItem('shopmind-theme') } catch { /* Storage may be disabled by the browser. */ }

class AppErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error) { console.error('ShopMind render error:', error); }
  render() {
    if (this.state.error) return <main style={{fontFamily:'Arial,sans-serif',padding:'48px',color:'#24382d'}}><h1>ShopMind could not load</h1><p>Open the browser Console (F12) and share the first error with the developer.</p><pre style={{whiteSpace:'pre-wrap',color:'#a33'}}>{this.state.error.message}</pre></main>;
    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppErrorBoundary>
    <App />
    </AppErrorBoundary>
  </StrictMode>,
)
