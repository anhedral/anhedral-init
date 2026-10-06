import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers';
import { createDatabase, schema } from '@workspace/db';
import { and, eq } from 'drizzle-orm';
export class ApplicationWorkflow extends WorkflowEntrypoint<Env,{operationId:string;userId:string}> {
 async run(event:WorkflowEvent<{operationId:string;userId:string}>,step:WorkflowStep){
  const {operationId,userId}=event.payload;
  const task=await step.do('load-task',async()=>{
   const connection=createDatabase(this.env.HYPERDRIVE.connectionString);
   try {const [task]=await connection.db.select().from(schema.task).where(and(eq(schema.task.id,operationId),eq(schema.task.userId,userId)));if(!task)throw new Error('Task not found');await connection.db.update(schema.task).set({status:'running'}).where(eq(schema.task.id,operationId));return {title:task.title,projectId:task.projectId};}finally{await connection.close();}
  });
  const reportKey=`reports/${userId}/${operationId}.md`;
  await step.do('write-report',async()=>{
   await this.env.FILES.put(reportKey,`# Delivery exercise\n\nTask: ${task.title}\n\nThis example processed a durable delivery job through Cloudflare Queues and Workflows. It demonstrates infrastructure, not autonomous code delivery or a production approval.\n\nOperation: ${operationId}\n`,{httpMetadata:{contentType:'text/markdown'}});
  });
  await step.do('complete-task',async()=>{
   const connection=createDatabase(this.env.HYPERDRIVE.connectionString);
   try {await connection.db.update(schema.task).set({status:'complete',reportKey}).where(and(eq(schema.task.id,operationId),eq(schema.task.userId,userId)));}finally{await connection.close();}
  });
  await step.do('notify',async()=>{await this.env.ROOMS.getByName(userId).fetch(new Request('https://room/publish',{method:'POST',body:JSON.stringify({type:'task.complete',operationId})}));});
  await step.do('record-event',async()=>{await this.env.ANALYTICS.send([{value:{event:'delivery.completed',at:new Date().toISOString()}}]);});
  return {operationId,reportKey};
 }
}
