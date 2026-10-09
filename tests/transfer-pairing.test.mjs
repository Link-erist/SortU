import test from 'node:test';
import assert from 'node:assert/strict';

const load = () => import('../public/transfer/pairing.js');
const description = (type, fingerprint = 'AA:BB') => ({type, sdp: `v=0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\na=fingerprint:sha-256 ${fingerprint}\r\na=candidate:1 1 UDP 1 example.local 1234 typ host\r\n`});

test('pairing QR frames assemble out of order and reject mixed content', async () => {
  const {encodePairing, createFrameCollector} = await load();
  const payload = {version:1,pairingId:crypto.randomUUID(),role:'offer',expiresAt:Date.now()+10000,description:description('offer')};
  const frames = await encodePairing(payload, 180);
  assert.ok(frames.length > 1);
  assert.ok(frames.every(f => f.length <= 180));
  const collector = createFrameCollector();
  let result;
  for (const f of frames.toReversed()) result = await collector.add(f);
  assert.deepEqual(result, payload);
  const mixed = createFrameCollector();
  await mixed.add(frames[0]);
  const other = await encodePairing({...payload,pairingId:crypto.randomUUID()},180);
  await assert.rejects(() => mixed.add(other[1]), /different|mixed/i);
});

test('pairing rejects expiry, oversized descriptions and mismatched answers', async () => {
  const {validatePairing, createPairing} = await load();
  assert.throws(() => validatePairing({version:1,pairingId:crypto.randomUUID(),role:'offer',expiresAt:0,description:description('offer')}), /expired/i);
  assert.throws(() => validatePairing({version:1,pairingId:crypto.randomUUID(),role:'offer',expiresAt:Date.now()+1000,description:description('offer','x'.repeat(140000))}), /large/i);
  let config;
  const peer = {iceGatheringState:'complete',createDataChannel:(_n,o)=>{assert.equal(o.ordered,true);return {};},createOffer:async()=>description('offer'),setLocalDescription:async d=>{peer.localDescription=d;},close(){},addEventListener(){}};
  const session = await createPairing({role:'offer',peerFactory:c=>{config=c;return peer;}});
  assert.deepEqual(config.iceServers, []);
  await assert.rejects(() => session.applyAnswer({...session.payload,pairingId:crypto.randomUUID(),role:'answer',description:description('answer')}), /match/i);
  session.close();
});

test('verification code binds both full descriptions', async () => {
  const {verificationCode} = await load();
  const offer = description('offer'); const answer = description('answer');
  const first = await verificationCode(offer, answer);
  assert.equal(first, await verificationCode(offer, answer));
  assert.notEqual(first, await verificationCode(offer, description('answer','CC:DD')));
  assert.match(first, /^[0-9A-F]{4} [0-9A-F]{4}$/);
});
