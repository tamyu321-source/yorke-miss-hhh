import assert from 'node:assert/strict';
import { mergeTodayFeaturePayload } from './todaySync.js';

const PREFIX = 'first-meeting:';

runTest('merges checkins and keeps the newer daily state from two devices', () => {
  const existing = createPayload({
    [`${PREFIX}checkins`]: JSON.stringify(['2026-07-10']),
    [`${PREFIX}mood-history`]: JSON.stringify(['2026-07-10:sunny']),
    [`${PREFIX}checkins-repair-2026-07-12`]: 'done',
    [`${PREFIX}today-shared-updated-at`]: '200',
    [`${PREFIX}message:2026-07-10`]: 'newer cloud message',
    [`${PREFIX}today-updated-at:2026-07-10`]: '200'
  });
  const incoming = createPayload({
    [`${PREFIX}checkins`]: JSON.stringify(['2026-07-11']),
    [`${PREFIX}mood-history`]: JSON.stringify(['2026-07-11:calm']),
    [`${PREFIX}checkins-repair-2026-07-12`]: 'done',
    [`${PREFIX}today-shared-updated-at`]: '300',
    [`${PREFIX}message:2026-07-10`]: 'stale phone message',
    [`${PREFIX}today-updated-at:2026-07-10`]: '100',
    [`${PREFIX}message:2026-07-11`]: 'new phone message',
    [`${PREFIX}today-updated-at:2026-07-11`]: '300'
  });

  const merged = mergeTodayFeaturePayload(existing, incoming).localStorage;

  assert.deepEqual(JSON.parse(merged[`${PREFIX}checkins`]), ['2026-07-10', '2026-07-11']);
  assert.deepEqual(JSON.parse(merged[`${PREFIX}mood-history`]), [
    '2026-07-10:sunny',
    '2026-07-11:calm'
  ]);
  assert.equal(merged[`${PREFIX}message:2026-07-10`], 'newer cloud message');
  assert.equal(merged[`${PREFIX}message:2026-07-11`], 'new phone message');
  assert.equal(merged[`${PREFIX}today-shared-updated-at`], '300');
});

runTest('repairs the confirmed checkin range once', () => {
  const repaired = mergeTodayFeaturePayload(null, createPayload({})).localStorage;
  const repairedDates = JSON.parse(repaired[`${PREFIX}checkins`]);

  assert.equal(repairedDates.length, 53);
  assert.equal(repairedDates[0], '2026-05-21');
  assert.equal(repairedDates.at(-1), '2026-07-12');
  assert.equal(repaired[`${PREFIX}checkins-repair-2026-07-12`], 'done');
});

function createPayload(localStorage) {
  return {
    schemaVersion: 2,
    exportedAt: '2026-07-12T00:00:00.000Z',
    localStorage
  };
}

function runTest(name, callback) {
  callback();
  console.log(`passed: ${name}`);
}
