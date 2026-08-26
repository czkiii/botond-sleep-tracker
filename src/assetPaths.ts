export function publicAssetUrl(baseUrl: string, assetPath: string): string {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  return `${normalizedBase}${assetPath.replace(/^\\/+/, '')}`
}

export function installAssetCssVariables(baseUrl = import.meta.env.BASE_URL): void {
  const root = document.documentElement
  root.style.setProperty('--solemi-app-background', `url("${publicAssetUrl(baseUrl, 'app-background.png')}")`)
  root.style.setProperty('--solemi-awake-orb', `url("${publicAssetUrl(baseUrl, 'assets/ui/orbs/awake-orb-day.png')}")`)
  root.style.setProperty('--solemi-asleep-orb', `url("${publicAssetUrl(baseUrl, 'assets/ui/orbs/asleep-orb-night.png')}")`)
}
