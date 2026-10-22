import { describe, expect, it } from 'vitest'
import { publicAssetUrl } from './assetPaths'

describe('publicAssetUrl', () => {
  it('resolves assets from the root-based internal preview', () => {
    expect(publicAssetUrl('/', '/app-background.png')).toBe('/app-background.png')
  })

  it('resolves assets from the GitHub Pages subdirectory', () => {
    expect(publicAssetUrl('/botond-sleep-tracker/', 'assets/ui/orbs/awake-orb-day.png'))
      .toBe('/botond-sleep-tracker/assets/ui/orbs/awake-orb-day.png')
  })
})
