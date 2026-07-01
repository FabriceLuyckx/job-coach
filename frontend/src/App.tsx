import { BrowserRouter, NavLink, Routes, Route, Navigate } from 'react-router-dom'
import ProfilePage from './pages/Profile'
import CVGeneratorPage from './pages/CVGenerator'
import JobsPage from './pages/Jobs'
import SettingsPage from './pages/Settings'
import SetupBanner from './components/SetupBanner'
import './App.css'

export default function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <nav className="sidebar-nav">
          <div className="nav-logo">🎯 Job Coach</div>
          <NavLink to="/profile">Profile</NavLink>
          <NavLink to="/cv">CV Generator</NavLink>
          <NavLink to="/jobs">Job Suggestions</NavLink>
          <div className="nav-spacer" />
          <NavLink to="/settings">Settings</NavLink>
        </nav>
        <main className="app-content">
          <SetupBanner />
          <Routes>
            <Route path="/" element={<Navigate to="/profile" replace />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/cv" element={<CVGeneratorPage />} />
            <Route path="/jobs" element={<JobsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
