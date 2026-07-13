import { useEffect, useState } from 'react'
import { BrowserRouter, NavLink, Routes, Route, Navigate } from 'react-router-dom'
import { Trans, useTranslation } from 'react-i18next'
import { UserRound, SlidersHorizontal, FileText, Briefcase, Settings } from 'lucide-react'
import ProfilePage from './pages/Profile'
import PreferencesPage from './pages/Preferences'
import ApplicationsPage from './pages/Applications'
import JobsPage from './pages/Jobs'
import SettingsPage from './pages/Settings'
import SetupBanner from './components/SetupBanner'
import ErrorBoundary from './components/ErrorBoundary'
import Onboarding from './components/Onboarding'
import { ToastProvider } from './components/Toast'
import { ApiKeyBanner, KeyStatusProvider } from './components/KeyStatus'
import { api } from './api'
import { loadLanguage } from './i18n'
import './App.css'

export default function App() {
  const { t } = useTranslation()
  // null = still checking; true = show the first-run wizard.
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null)

  // Reconcile the UI language with the server preference and decide whether the
  // first-run wizard should appear (engine not ready AND not previously skipped).
  useEffect(() => {
    Promise.all([api.getSettings(), api.getEngine()])
      .then(([s, e]) => {
        if (s.app_language) void loadLanguage(s.app_language)
        setShowOnboarding(!e.ready && !s.onboarding_done)
      })
      .catch(() => setShowOnboarding(false))
  }, [])

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <ToastProvider>
          <KeyStatusProvider>
            {showOnboarding && <Onboarding onDone={() => setShowOnboarding(false)} />}
            <div className="app-shell">
              <nav className="sidebar-nav">
                <div className="nav-logo">{t('nav.brand')} <em>{t('nav.brandEm')}</em></div>
                <NavLink to="/profile"><UserRound size={17} aria-hidden />{t('nav.profile')}</NavLink>
                <NavLink to="/preferences"><SlidersHorizontal size={17} aria-hidden />{t('nav.preferences')}</NavLink>
                <NavLink to="/jobs"><Briefcase size={17} aria-hidden />{t('nav.jobs')}</NavLink>
                <NavLink to="/applications"><FileText size={17} aria-hidden />{t('nav.applications')}</NavLink>
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
                    <Route path="/preferences" element={<PreferencesPage />} />
                    <Route path="/applications" element={<ApplicationsPage />} />
                    {/* Old split pages redirect to the merged Applications page. */}
                    <Route path="/cv" element={<Navigate to="/applications" replace />} />
                    <Route path="/letters" element={<Navigate to="/applications" replace />} />
                    <Route path="/jobs" element={<JobsPage />} />
                    <Route path="/settings" element={<SettingsPage />} />
                  </Routes>
                </div>
                <footer className="app-footer">
                  <Trans
                    i18nKey="footer.credit"
                    components={{
                      a: <a href="https://github.com/FabriceLuyckx/job-coach" target="_blank" rel="noreferrer" />,
                    }}
                  />
                </footer>
              </main>
            </div>
          </KeyStatusProvider>
        </ToastProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
