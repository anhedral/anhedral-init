import { DurableObject } from 'cloudflare:workers';
export class Room extends DurableObject<Env> {
 private streams=new Set<WritableStreamDefaultWriter<Uint8Array>>();
 async fetch(request:Request):Promise<Response>{
  const path=new URL(request.url).pathname;
  if(path==='/publish')return this.publish(request);
  if(path==='/events')return this.events();
  if(path==='/socket')return this.socket(request);
  return new Response('Not found',{status:404});
 }
 private async publish(request:Request){
  if(request.method!=='POST')return new Response('Method not allowed',{status:405});
  const message=await request.text();
  if(message.length>16384)return new Response('Too large',{status:413});
  const data=new TextEncoder().encode(`data: ${message}\n\n`);
  this.ctx.getWebSockets().forEach(socket=>{try{socket.send(message);}catch{socket.close();}});
  await Promise.all([...this.streams].map(async writer=>{try{await writer.write(data);}catch{this.streams.delete(writer);}}));
  return new Response('ok');
 }
 private events(){
  if(this.streams.size>=10)return new Response('Too many connections',{status:429});
  const stream=new TransformStream<Uint8Array,Uint8Array>();const writer=stream.writable.getWriter();this.streams.add(writer);
  this.ctx.waitUntil(writer.write(new TextEncoder().encode('data: {"type":"connected"}\n\n')).catch(()=>this.streams.delete(writer)));
  writer.closed.catch(()=>this.streams.delete(writer));
  return new Response(stream.readable,{headers:{'Content-Type':'text/event-stream','Cache-Control':'no-cache'}});
 }
 private socket(request:Request){
  if(request.headers.get('Upgrade')!=='websocket')return new Response('WebSocket required',{status:426});
  if(this.ctx.getWebSockets().length>=10)return new Response('Too many connections',{status:429});
  const pair=new WebSocketPair();this.ctx.acceptWebSocket(pair[1]);
  pair[1].send('{"type":"connected"}');
  return new Response(null,{status:101,webSocket:pair[0]});
 }
 webSocketMessage(socket:WebSocket,message:string|ArrayBuffer){
  if(message==='ping'){socket.send('pong');return;}
  socket.close(1008,'Client publishing is not supported');
 }
}
