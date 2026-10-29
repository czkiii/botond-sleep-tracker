import { createRequire } from 'node:module'
import { X509Certificate } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { Environment, SignedDataVerifier } from '@apple/app-store-server-library'
const { KJUR, KEYUTIL } = createRequire(import.meta.url)('jsrsasign')

// Ephemeral, entirely synthetic PKI. None of these keys/certificates is trusted by
// the deployed adapter, whose sole root is Apple's pinned public G3 certificate.
export function appleSigningFixture(bundleId: string, appId: number) {
  const root = KEYUTIL.generateKeypair('EC', 'secp256r1')
  const intermediate = KEYUTIL.generateKeypair('EC', 'secp256r1')
  const leaf = KEYUTIL.generateKeypair('EC', 'secp256r1')
  const makeCert = (subject: string, issuer: string, pub: unknown, key: unknown, ext: unknown[]) =>
    new KJUR.asn1.x509.Certificate({ version: 3, serial: { int: 1 }, sigalg: 'SHA256withECDSA',
      issuer: { str: `/CN=${issuer}` }, subject: { str: `/CN=${subject}` },
      notbefore: '250101000000Z', notafter: '350101000000Z', sbjpubkey: pub, cakey: key, ext }).getPEM()
  const rootPem = makeCert('Synthetic Root', 'Synthetic Root', root.pubKeyObj, root.prvKeyObj,
    [{ extname: 'basicConstraints', cA: true }])
  const intermediatePem = makeCert('Synthetic Intermediate', 'Synthetic Root', intermediate.pubKeyObj, root.prvKeyObj,
    [{ extname: 'basicConstraints', cA: true }, { extname: '1.2.840.113635.100.6.2.1', extn: '0500' }])
  const leafPem = makeCert('Synthetic Leaf', 'Synthetic Intermediate', leaf.pubKeyObj, intermediate.prvKeyObj,
    [{ extname: 'basicConstraints', cA: false }, { extname: '1.2.840.113635.100.6.11.1', extn: '0500' }])
  const roots = [new X509Certificate(rootPem).raw]
  const x5c = [leafPem, intermediatePem, rootPem].map(pem => new X509Certificate(pem).raw.toString('base64'))
  return {
    rootBase64: roots[0].toString('base64'),
    verifier: new SignedDataVerifier(roots, false, Environment.SANDBOX, bundleId, appId),
    sign: (payload: unknown) => KJUR.jws.JWS.sign('ES256', JSON.stringify({ alg: 'ES256', x5c }), JSON.stringify(payload), leaf.prvKeyObj) as string,
    changePayload: (jws: string) => {
      const parts = jws.split('.'); parts[1] = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(parts[1], 'base64url').toString()), productId: 'tampered' })).toString('base64url')
      return parts.join('.')
    }
  }
}
