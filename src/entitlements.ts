export const productPlans = ['free', 'family', 'familyPlus'] as const

export const INTERNAL_PLAN_PREVIEW_KEY = 'solemi-internal-plan-preview'
export const INTERNAL_PLAN_PREVIEW_EVENT = 'solemi-internal-plan-preview-change'

export type ProductPlan = typeof productPlans[number]

export const premiumInsightFeatures = [
  'wakeWindow',
  'routinePatterns',
  'sleepDevelopment',
  'sleepChange',
  'monthlyReport',
  'similarDays',
  'nextSleepPrediction'
] as const

export type PremiumInsightFeature = typeof premiumInsightFeatures[number]

export function canUsePremiumInsights(plan: ProductPlan) {
  return plan === 'familyPlus'
}

export function canUseFamilySync(plan: ProductPlan) {
  return plan === 'family' || plan === 'familyPlus'
}

export function parseProductPlan(value: unknown): ProductPlan | null {
  return productPlans.includes(value as ProductPlan) ? value as ProductPlan : null
}
