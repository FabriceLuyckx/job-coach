import { BrowserRouter, NavLink, Routes, Route, Navigate } from 'react-router-dom'
import { UserRound, FileText, Briefcase, Settings } from 'lucide-react'
import ProfilePage from './pages/Profile'
import CVGeneratorPage from './pages/CVGenerator'
import JobsPage from './pages/Jobs'
import SettingsPage from './pages/Settings'
import SetupBanner from './components/SetupBanner'
import ErrorBoundary from './components/ErrorBoundary'
import { ToastProvider } from './components/Toast'
import { ApiKeyBanner, KeyStatusProvider } from './components/KeyStatus'
import './App.css'

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <ToastProvider>
          <KeyStatusProvider>
            <div className="app-shell">
              <nav className="sidebar-nav">
                <div className="nav-logo">Job <em>Coach</em></div>
                <NavLink to="/profile"><UserRound size={17} aria-hidden />Profile</NavLink>
                <NavLink to="/cv"><FileText size={17} aria-hidden />CV Generator</NavLink>
                <NavLink to="/jobs"><Briefcase size={17} aria-hidden />Job Suggestions</NavLink>
                <div className="nav-spacer" />
                <NavLink to="/settings"><Settings size={17} aria-hidden />Settings</NavLink>
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
