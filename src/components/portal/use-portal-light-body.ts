import { useEffect } from 'react'

/**
 * Radix portals (dialogs, popovers, selects, menus, toasts) mount under
 * `document.body`, outside the portal shell's wrapper divs. Pinning the light
 * tokens on body too keeps portalled content light for dark-OS users.
 */
export function usePortalLightBody(): void {
  useEffect(() => {
    document.body.classList.add('portal-light')
    return () => document.body.classList.remove('portal-light')
  }, [])
}
