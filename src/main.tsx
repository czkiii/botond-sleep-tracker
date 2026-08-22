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

registerSW({ immediate: true })

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    <FamilySyncLayer />
  </React.StrictMode>
)
