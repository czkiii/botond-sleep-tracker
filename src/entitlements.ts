export const productPlans = ['free', 'family', 'familyPlus'] as const

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
