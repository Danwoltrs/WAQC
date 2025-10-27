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

export const getMsalInstance = () => {
  if (typeof window === 'undefined') return null

  if (!msalInstance) {
    msalInstance = new PublicClientApplication(msalConfig)
  }

  return msalInstance
}

// Sign in with popup
export const signInWithAzureAD = async (): Promise<AuthenticationResult> => {
  const msal = getMsalInstance()
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
  const msal = getMsalInstance()
  if (!msal) throw new Error('MSAL not initialized')

  try {
    await msal.loginRedirect(loginRequest)
  } catch (error) {
    console.error('Azure AD redirect login error:', error)
    throw error
  }
}

// Handle redirect response
export const handleAzureADRedirect = async (): Promise<AuthenticationResult | null> => {
  const msal = getMsalInstance()
  if (!msal) return null

  try {
    const response = await msal.handleRedirectPromise()
    return response
  } catch (error) {
    console.error('Azure AD redirect handling error:', error)
    throw error
  }
}

// Get access token silently
export const getAccessToken = async (): Promise<string | null> => {
  const msal = getMsalInstance()
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
  const msal = getMsalInstance()
  if (!msal) return

  const accounts = msal.getAllAccounts()
  if (accounts.length > 0) {
    await msal.logoutPopup({
      account: accounts[0],
    })
  }
}
