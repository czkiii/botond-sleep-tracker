export const entitlementFeatures = ['FAMILY_SYNC', 'PDF_EXPORT', 'FAMILY_PLUS_INSIGHTS'] as const

export type EntitlementFeature = typeof entitlementFeatures[number]

// Client state built from server-validated entitlement data. The Worker remains
// the authority and must enforce the same decisions before serving family data.
export type AccountAccessState = {
  accountId: string
  activeFeatures: readonly EntitlementFeature[]
}

export type FamilyMembershipState = {
  accountId: string
  familyId: string
  status: 'ACTIVE' | 'LEFT' | 'REMOVED'
  activeFeatures: readonly EntitlementFeature[]
}

export type FamilySyncAccess =
  | { status: 'SIGNED_OUT'; canSync: false }
  | { status: 'NO_ACTIVE_MEMBERSHIP'; canSync: false }
  | { status: 'PAUSED'; canSync: false; familyId: string }
  | { status: 'RECONCILIATION_REQUIRED'; canSync: false; familyId: string }
  | { status: 'ACTIVE'; canSync: true; familyId: string }

export function accountCanUse(feature: EntitlementFeature, account: AccountAccessState | null) {
  return Boolean(account?.activeFeatures.includes(feature))
}

export function familyCanUse(
  feature: EntitlementFeature,
  familyId: string,
  members: readonly FamilyMembershipState[]
) {
  return members.some((member) =>
    member.familyId === familyId
    && member.status === 'ACTIVE'
    && member.activeFeatures.includes(feature)
  )
}

export function familyCanSync(familyId: string, members: readonly FamilyMembershipState[]) {
  return familyCanUse('FAMILY_SYNC', familyId, members)
}

export function memberCanUse(
  feature: EntitlementFeature,
  account: AccountAccessState | null,
  membership: FamilyMembershipState | null,
  familyMembers: readonly FamilyMembershipState[]
) {
  if (accountCanUse(feature, account)) return true
  return Boolean(account && membership
    && membership.accountId === account.accountId
    && membership.status === 'ACTIVE'
    && familyCanUse(feature, membership.familyId, familyMembers))
}

export function resolveFamilySyncAccess({
  account,
  membership,
  familyMembers,
  reconciliationRequired = false
}: {
  account: AccountAccessState | null
  membership: FamilyMembershipState | null
  familyMembers: readonly FamilyMembershipState[]
  reconciliationRequired?: boolean
}): FamilySyncAccess {
  if (!account) return { status: 'SIGNED_OUT', canSync: false }
  if (!membership || membership.accountId !== account.accountId || membership.status !== 'ACTIVE') {
    return { status: 'NO_ACTIVE_MEMBERSHIP', canSync: false }
  }
  if (!familyCanSync(membership.familyId, familyMembers)) {
    return { status: 'PAUSED', canSync: false, familyId: membership.familyId }
  }
  if (reconciliationRequired) {
    return { status: 'RECONCILIATION_REQUIRED', canSync: false, familyId: membership.familyId }
  }
  return { status: 'ACTIVE', canSync: true, familyId: membership.familyId }
}
