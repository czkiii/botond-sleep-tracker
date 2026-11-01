import type { AppleSignInEnv } from './appleSignInProvider'
export interface NativeAuthEnv extends AppleSignInEnv {
  NATIVE_APPLE_AUTH_ENABLED?: string
  NATIVE_AUTH_ENABLED?: string
  NATIVE_GOOGLE_WEB_CLIENT_ID?: string
  NATIVE_GOOGLE_IOS_CLIENT_ID?: string
  NATIVE_GOOGLE_AUTHORIZED_PARTIES?: string
  NATIVE_APPLE_CLIENT_ID?: string
}
export function nativePlatform(origin: string | null, env: NativeAuthEnv): 'IOS' | 'ANDROID' | null {
  if (env.NATIVE_AUTH_ENABLED !== 'true') return null
  return origin === 'capacitor://localhost' ? 'IOS' : origin === 'https://localhost' ? 'ANDROID' : null
}
