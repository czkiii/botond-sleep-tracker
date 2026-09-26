// Replaced by the staging deploy script while bundling, never a runtime binding.
declare const __SOLEMI_BUILD_SHA__: string

export function buildSha(): string {
  const value = typeof __SOLEMI_BUILD_SHA__ === 'string' ? __SOLEMI_BUILD_SHA__ : ''
  return /^[a-f0-9]{40}$/.test(value) ? value : 'local'
}
