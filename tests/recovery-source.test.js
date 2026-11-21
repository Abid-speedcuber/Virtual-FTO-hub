import test from 'node:test';
import assert from 'node:assert/strict';
import {recoverySource} from '../src/leaderboard-recovery.js';
test('recovery accepts recording links and submission IDs without following external URLs',()=>{
 const code='a'.repeat(32),id='11111111-1111-4111-8111-111111111111';
 for(const v of [code,`https://ftoers.web.app/virtual/#short=${code}`,`#short=${code}`])assert.equal(recoverySource(v),code);
 for(const v of [id,`https://ftoers.web.app/virtual/#rank=${id}`])assert.equal(recoverySource(v),id);
 for(const v of ['','https://example.com/no-recording','#short=bad','javascript:alert(1)','{"format":"anything"}'])assert.throws(()=>recoverySource(v),/Paste/);
});
