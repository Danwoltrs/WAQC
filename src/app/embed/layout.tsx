/**
 * Embed layout — full-bleed, no app chrome.
 *
 * The root app/layout.tsx wraps everything in ThemeProvider (which reads localStorage
 * and toggles the `dark` class on documentElement). The embed page overrides this via
 * its own useEffect that applies the `?theme=` query param directly on documentElement.
 * No sidebar, nav, or session-UI is rendered here.
 */
export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
