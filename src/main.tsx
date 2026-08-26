import React from 'react'
import ReactDOM from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import FamilySyncLayer from './FamilySyncLayer'
import './styles.css'
import './ux-tuning.css'
import './today-fit.css'
import './copy-overrides.css'
import './background-theme.css'
import './family-sync.css'

const internalPreview = import.meta.env.VITE_INTERNAL_PREVIEW === 'true'
const buildSha = import.meta.env.VITE_BUILD_SHA?.slice(0, 7) || 'local'

if (!internalPreview) registerSW({ immediate: true })

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {internalPreview && <div className="internal-preview-banner">INTERNAL / TEST <span>Family Sync disabled · {buildSha}</span></div>}
    <App />
    {!internalPreview && <FamilySyncLayer />}
  </React.StrictMode>
)
