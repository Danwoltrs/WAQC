import { PublicClientApplication, Configuration, AuthenticationResult } from '@azure/msal-browser'

// Azure AD configuration
const msalConfig: Configuration = {
  auth: {
    clientId: process.env.NEXT_PUBLIC_AZURE_AD_CLIENT_ID!,
    authority: `https://login.microsoftonline.com/${process.env.NEXT_PUBLIC_AZURE_AD_TENANT_ID}`,
    redirectUri: typeof window !== 'undefined' ? `${window.location.origin}/auth/azure-callback` : '',
  },
  cache: {
    cacheLocation: 'sessionStorage',
    storeAuthStateInCookie: false,
  },
}

// Login request scopes
export const loginRequest = {
  scopes: ['User.Read', 'email', 'profile', 'openid'],
}

// Create MSAL instance
let msalInstance: PublicClientApplication | null = null
let msalInitPromise: Promise<void> | null = null
let redirectHandled = false

export const getMsalInstance = async (): Promise<PublicClientApplication | null> => {
  if (typeof window === 'undefined') return null

  if (!msalInstance) {
    msalInstance = new PublicClientApplication(msalConfig)
    // Initialize MSAL - required before any other MSAL operations
    msalInitPromise = msalInstance.initialize()
  }

  // Wait for initialization to complete
  if (msalInitPromise) {
    await msalInitPromise
    msalInitPromise = null // Clear after first init
  }

  return msalInstance
}

// Reset redirect handled flag (for testing/debugging)
export const resetRedirectState = () => {
  redirectHandled = false
}

// Sign in with popup
export const signInWithAzureAD = async (): Promise<AuthenticationResult> => {
  const msal = await getMsalInstance()
  if (!msal) throw new Error('MSAL not initialized')

  try {
    const response = await msal.loginPopup(loginRequest)
    return response
  } catch (error) {
    console.error('Azure AD login error:', error)
    throw error
  }
}

// Sign in with redirect
export const signInWithAzureADRedirect = async (): Promise<void> => {
  const msal = await getMsalInstance()
  if (!msal) throw new Error('MSAL not initialized')

  try {
    await msal.loginRedirect(loginRequest)
  } catch (error: any) {
    console.error('Azure AD redirect login error:', error)

    // If interaction is in progress, clear the state and retry
    if (error.errorCode === 'interaction_in_progress') {
      console.log('Interaction in progress detected, clearing state...')

      // Clear MSAL cache to reset state
      sessionStorage.clear()
      localStorage.removeItem('msal.interaction.status')

      // Wait a moment for state to clear
      await new Promise(resolve => setTimeout(resolve, 100))

      // Try again
      try {
        await msal.loginRedirect(loginRequest)
        return
      } catch (retryError) {
        console.error('Retry after clearing state failed:', retryError)
        throw new Error('Authentication state is stuck. Please refresh the page and try again.')
      }
    }

    throw error
  }
}

// Handle redirect response
export const handleAzureADRedirect = async (): Promise<AuthenticationResult | null> => {
  const msal = await getMsalInstance()
  if (!msal) return null

  // Only handle redirect once per session
  if (redirectHandled) {
    console.log('Redirect already handled, skipping...')
    return null
  }

  try {
    const response = await msal.handleRedirectPromise()

    if (response) {
      redirectHandled = true
      console.log('Azure AD redirect handled successfully')
    }

    return response
  } catch (error) {
    console.error('Azure AD redirect handling error:', error)
    throw error
  }
}

// Get access token silently
export const getAccessToken = async (): Promise<string | null> => {
  const msal = await getMsalInstance()
  if (!msal) return null

  const accounts = msal.getAllAccounts()
  if (accounts.length === 0) return null

  try {
    const response = await msal.acquireTokenSilent({
      ...loginRequest,
      account: accounts[0],
    })
    return response.accessToken
  } catch (error) {
    console.error('Token acquisition error:', error)
    return null
  }
}

// Sign out
export const signOutFromAzureAD = async (): Promise<void> => {
  const msal = await getMsalInstance()
  if (!msal) return

  const accounts = msal.getAllAccounts()
  if (accounts.length > 0) {
    await msal.logoutPopup({
      account: accounts[0],
    })
  }
}
