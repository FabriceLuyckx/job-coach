import { Component } from 'react'
import type { ReactNode } from 'react'

interface State { error: Error | null }

/** Last-resort catch: a render-time throw shows a recoverable screen instead
 * of blanking the whole app. */
export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="error-screen">
        <h1>Something went wrong</h1>
        <p>The app hit an unexpected error. Your data is safe — reloading usually fixes it.</p>
        <pre>{this.state.error.message}</pre>
        <button type="button" className="btn-primary" onClick={() => window.location.reload()}>
          Reload the app
        </button>
      </div>
    )
  }
}
