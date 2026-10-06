import test from 'node:test';
import assert from 'node:assert/strict';
import consumer from '../apps/jobs/src/index.ts';
function message(body={operationId:'task-1',userId:'owner-1'}) {
 const result={body,acknowledged:0,retried:0};
 result.ack=()=>result.acknowledged++;
 result.retry=()=>result.retried++;
 return result;
}
test('delivery is acknowledged only after the Workflow accepts it',async()=>{
 const item=message();let dispatched;
 await consumer.queue({messages:[item]},{WORKFLOW:{create:async options=>{dispatched=options;}}});
 assert.deepEqual(dispatched,{id:'task-1',params:item.body});
 assert.equal(item.acknowledged,1);assert.equal(item.retried,0);
});
test('queue redelivery recognizes an existing completed Workflow',async()=>{
 const item=message();
 await consumer.queue({messages:[item]},{WORKFLOW:{create:async()=>{throw Error('already exists');},get:async id=>{assert.equal(id,'task-1');return {status:async()=>({status:'complete'})};}}});
 assert.equal(item.acknowledged,1);assert.equal(item.retried,0);
});
test('workflow dispatch failure retries rather than losing the task',async()=>{
 const item=message();
 await consumer.queue({messages:[item]},{WORKFLOW:{create:async()=>{throw Error('unavailable');},get:async()=>{throw Error('unavailable');}}});
 assert.equal(item.acknowledged,0);assert.equal(item.retried,1);
});
test('malformed messages go through bounded retries toward the dead-letter queue',async()=>{
 const item=message({});
 await consumer.queue({messages:[item]},{});
 assert.equal(item.acknowledged,0);assert.equal(item.retried,1);
});
