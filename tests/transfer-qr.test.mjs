import test from 'node:test';import assert from 'node:assert/strict';
test('bundled QR encoder and scanner roundtrip pixels without internet',async()=>{
  const {qrPixels,decodePixels}=await import('../public/transfer/qr.js');
  const pixels=qrPixels('FT1|offline-pairing-fixture');
  assert.equal(decodePixels(pixels.data,pixels.width,pixels.height),'FT1|offline-pairing-fixture');
});
