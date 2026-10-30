import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Narrow, repeatable patch for the pinned bridge. Refuse upstream source changes
// instead of silently falling back to a different subscription/introductory offer.
const root = new URL('../node_modules/@capgo/native-purchases/', import.meta.url)
if (JSON.parse(readFileSync(new URL('package.json', root), 'utf8')).version !== '8.9.6') {
  throw new Error('Review the Solemi billing patch before changing the bridge version')
}
function patch(relative, before, after) {
  const path = fileURLToPath(new URL(relative, root))
  const source = readFileSync(path, 'utf8').replaceAll('\r\n', '\n')
  if (source.includes(after)) return
  if (source.split(before).length !== 2) throw new Error(`Unexpected native billing source: ${relative}`)
  writeFileSync(path, source.replace(before, after))
}
const java = 'android/src/main/java/ee/forgr/nativepurchases/'
patch(`${java}NativePurchasesPlugin.java`,
  'if (offerDetails.getBasePlanId().equals(planIdentifier)) {',
  `if (offerDetails.getBasePlanId().equals(planIdentifier)
                                        && offerDetails.getOfferId() == null
                                        && offerToken != null && offerToken.equals(offerDetails.getOfferToken())
                                        && offerDetails.getPricingPhases().getPricingPhaseList().size() == 1
                                        && offerDetails.getPricingPhases().getPricingPhaseList().get(0).getRecurrenceMode()
                                            == ProductDetails.RecurrenceMode.INFINITE_RECURRING) {`)
patch(`${java}NativePurchasesPlugin.java`,
  `selectedOfferDetails = productDetailsItem.getSubscriptionOfferDetails().get(0);
                                    NativePurchasesLog.d(TAG, "Using first available offer: " + selectedOfferDetails.getBasePlanId());`,
  `closeBillingClient();
                                    call.reject("Selected subscription offer unavailable");
                                    return;`)
patch(`${java}ProductPayloadMapper.java`,
  'product.put("introEligibility", INTRO_ELIGIBILITY_UNKNOWN);\n\n        if (offerDetails.getOfferId() == null)',
  `product.put("introEligibility", INTRO_ELIGIBILITY_UNKNOWN);
        product.put("solemiAutoRenew", phases.size() == 1 && standardPhase != null
            && standardPhase.getRecurrenceMode() == ProductDetails.RecurrenceMode.INFINITE_RECURRING);
        if (standardPhase != null) {
            product.put("subscriptionPeriod", subscriptionPeriodFromBillingPeriod(standardPhase.getBillingPeriod()));
        }

        if (offerDetails.getOfferId() == null)`)
const swift = 'ios/Sources/NativePurchasesPlugin/NativePurchasesPlugin+TransactionFinishing.swift'
patch(swift, 'print("Manually finishing transaction: \\(transaction.id)")', 'NativePurchasesLog.debug("Manually finishing verified transaction")')
patch(swift, 'print("Transaction \\(transactionId) already finished")', 'NativePurchasesLog.debug("Verified transaction already finished")')
console.log('Solemi native billing: exact regular base-plan selection and private completion logging applied (8.9.6).')
