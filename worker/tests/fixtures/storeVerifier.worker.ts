// Local runtime probe only. Never referenced by a deployable Wrangler config.
import { Buffer } from 'node:buffer'
export default {
  async fetch(request: Request) {
    const body = await request.json() as { root: string; jws: string }
    try {
      const { SignedDataVerifier, Environment } = await import('@apple/app-store-server-library')
      const verifier = new SignedDataVerifier([Buffer.from(body.root, 'base64')], false, Environment.SANDBOX, 'app.solemi.test', 123)
      const result = await verifier.verifyAndDecodeTransaction(body.jws)
      return Response.json({ verified: true, transactionId: result.transactionId })
    } catch { return Response.json({ verified: false }, { status: 422 }) }
  }
}
