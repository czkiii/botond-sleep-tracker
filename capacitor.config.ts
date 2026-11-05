import type { CapacitorConfig } from '@capacitor/cli'

// Set only by the explicit release preparation command, after a successful build.
const releasePlatform = process.env.SOLEMI_NATIVE_RELEASE_PLATFORM
if (releasePlatform && releasePlatform !== 'android' && releasePlatform !== 'ios') {
  throw new Error('Unknown native release platform')
}

// Provisional IDs: confirm in the store consoles before the first signed upload.
const config: CapacitorConfig = {
  appId: 'app.solemi.sleep',
  appName: 'Solemi Sleep',
  webDir: releasePlatform ? `dist-native-release/${releasePlatform}` : 'dist-native',
  server: { androidScheme: 'https', iosScheme: 'capacitor' },
  android: { allowMixedContent: false, webContentsDebuggingEnabled: false },
  ios: { webContentsDebuggingEnabled: false },
  loggingBehavior: 'none',
  plugins: {
    SocialLogin: { providers: { google: true, apple: true, facebook: false, twitter: false } },
    // Must apply BEFORE the plugin starts listening for unfinished transactions.
    NativePurchases: { autoFinishTransactions: false, debugLogging: false }
  }
}
export default config
