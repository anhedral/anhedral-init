export interface EventStream { send(events: Record<string, unknown>[]): Promise<void> }
export async function recordEvents(stream: EventStream, events: Record<string, unknown>[]) { await stream.send(events); }
