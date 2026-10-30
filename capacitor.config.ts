import type { CapacitorConfig } from '@capacitor/cli'

// Provisional IDs: confirm in the store consoles before the first signed upload.
const config: CapacitorConfig = {
  appId: 'app.solemi.sleep',
  appName: 'Solemi Sleep',
  webDir: 'dist-native',
  server: { androidScheme: 'https', iosScheme: 'capacitor' },
  android: { allowMixedContent: false, webContentsDebuggingEnabled: false },
  ios: { webContentsDebuggingEnabled: false },
  loggingBehavior: 'none',
  plugins: {
    // Must apply BEFORE the plugin starts listening for unfinished transactions.
    NativePurchases: { autoFinishTransactions: false, debugLogging: false }
  }
}
export default config
