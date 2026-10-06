type Job={operationId:string;userId:string};
async function dispatch(env:Env,job:Job){
 try {await env.WORKFLOW.create({id:job.operationId,params:job});}
 catch(error){const existing=await env.WORKFLOW.get(job.operationId);const state=await existing.status();if(state.status==='errored')throw error;}
}
async function processMessage(message:Message<Job>,env:Env){
 if(!message.body.operationId||!message.body.userId){console.error('Invalid delivery message; retrying to dead-letter queue');message.retry();return;}
 try {await dispatch(env,message.body);message.ack();}
 catch(error){console.error('Delivery dispatch failed',error);message.retry();}
}
export default {async queue(batch:MessageBatch<Job>,env:Env){for(const message of batch.messages)await processMessage(message,env);}};
