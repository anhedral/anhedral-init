import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash, generateKeyPairSync, privateEncrypt, constants } from 'node:crypto';
import { createRequire } from 'node:module';
import { join } from 'node:path';

// PR1152 validates nested DigestAlgorithm children; Anhedral also enforces empty
// DER NULL parameters. Fixture keys never leave memory.
export async function verifyForge(packageRoot) {
  const require = createRequire(join(packageRoot, 'package.json'));
  const forge = require(join(packageRoot, 'lib/index.js'));
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicExponent: 65537,
  });
  const key = forge.pki.publicKeyFromPem(publicKey.export({ type: 'spki', format: 'pem' }));
  const digest = createHash('sha256').update('Anhedral RSA validation fixture').digest();
  const asn1 = forge.asn1;
  const node = (type, value, constructed = false) =>
    asn1.create(asn1.Class.UNIVERSAL, type, constructed, value);
  const oid = () => node(asn1.Type.OID, asn1.oidToDer(forge.oids.sha256).getBytes());
  const nil = (value = '') => node(asn1.Type.NULL, value);
  const garbage = () => node(asn1.Type.OCTETSTRING, 'unconsumed');
  const verify = (algorithm, extraOuter = []) => {
    const info = node(asn1.Type.SEQUENCE, [
      node(asn1.Type.SEQUENCE, algorithm, true),
      node(asn1.Type.OCTETSTRING, digest.toString('binary')),
      ...extraOuter,
    ], true);
    const der = Buffer.from(asn1.toDer(info).getBytes(), 'binary');
    // Use normal PKCS#1 padding, never Forge's internal padding bypass options.
    const encoded = Buffer.concat([
      Buffer.from([0, 1]), Buffer.alloc(256 - der.length - 3, 255), Buffer.from([0]), der,
    ]);
    const signature = privateEncrypt({ key: privateKey, padding: constants.RSA_NO_PADDING }, encoded);
    return key.verify(digest.toString('binary'), signature.toString('binary'));
  };
  assert.equal(verify([oid(), nil()]), true, 'Valid RSA SHA-256 with NULL parameters rejected');
  assert.equal(verify([oid()]), true, 'Valid RSA SHA-256 without parameters rejected');
  for (const algorithm of [[oid(), nil(), garbage()], [oid(), garbage()], [oid(), nil('garbage')], [oid(), nil('\x00')]]) {
    assert.throws(() => verify(algorithm), /valid RSASSA-PKCS1-v1_5 DigestInfo/,
      'RSA verification accepted malformed DigestAlgorithm parameters');
  }
  assert.throws(() => verify([oid(), nil()], [garbage()]), /valid RSASSA-PKCS1-v1_5 DigestInfo/,
    'RSA verification accepted an extra outer DigestInfo element');
}
