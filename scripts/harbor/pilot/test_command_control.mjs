/** WO81 process-group assertions superseded prospectively by WO83 Criteria1.1.
 * Historical runner/evidence retained at 5552200379c3f4d45288b6942966d3ac755e3314. */
import test from 'node:test';
if(process.env.WO81_CONTROL_ROOT||process.env.WO81_OFFLINE_ROOT||process.env.WO81_SCOPE_AUTH||process.env.WO81_NORMAL3_AUTH)throw Error('WO81 controls superseded: use authorized test_handoff_container.mjs');
test('WO81 historical process-group control: replaced by WO83 semantic controls',{skip:true},()=>{});
