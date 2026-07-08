import { useEffect } from 'react'
import { BrowserRouter, NavLink, Routes, Route, Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { UserRound, FileText, Briefcase, Settings } from 'lucide-react'
import ProfilePage from './pages/Profile'
import CVGeneratorPage from './pages/CVGenerator'
import JobsPage from './pages/Jobs'
import SettingsPage from './pages/Settings'
import SetupBanner from './components/SetupBanner'
import ErrorBoundary from './components/ErrorBoundary'
import { ToastProvider } from './components/Toast'
import { ApiKeyBanner, KeyStatusProvider } from './components/KeyStatus'
import { api } from './api'
import { loadLanguage } from './i18n'
import './App.css'

export default function App() {
  const { t } = useTranslation()

  // Reconcile the UI language with the server-stored preference at boot.
  useEffect(() => {
    api.getSettings()
      .then(s => { if (s.app_language) void loadLanguage(s.app_language) })
      .catch(() => {})
  }, [])

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <ToastProvider>
          <KeyStatusProvider>
            <div className="app-shell">
              <nav className="sidebar-nav">
                <div className="nav-logo">{t('nav.brand')} <em>{t('nav.brandEm')}</em></div>
                <NavLink to="/profile"><UserRound size={17} aria-hidden />{t('nav.profile')}</NavLink>
                <NavLink to="/cv"><FileText size={17} aria-hidden />{t('nav.cv')}</NavLink>
                <NavLink to="/jobs"><Briefcase size={17} aria-hidden />{t('nav.jobs')}</NavLink>
                <div className="nav-spacer" />
                <NavLink to="/settings"><Settings size={17} aria-hidden />{t('nav.settings')}</NavLink>
              </nav>
              <main className="app-content">
                <div className="page-container">
                  <SetupBanner />
                  <ApiKeyBanner />
                  <Routes>
                    <Route path="/" element={<Navigate to="/profile" replace />} />
                    <Route path="/profile" element={<ProfilePage />} />
                    <Route path="/cv" element={<CVGeneratorPage />} />
                    <Route path="/jobs" element={<JobsPage />} />
                    <Route path="/settings" element={<SettingsPage />} />
                  </Routes>
                </div>
              </main>
            </div>
          </KeyStatusProvider>
        </ToastProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
