"use client"
import { useCallback, useEffect, useState } from "react"
import { Button } from "@workspace/ui/components/button"
type Project = { id: string; name: string; brief: string }
type Task = { id: string; projectId: string; title: string; status: string; reportKey: string | null }
type User = { name: string; email: string }
function errorMessage(result: {error?: {message?: string} | string; message?: string}) {
 if(typeof result.error === "string")return result.error
 return [result.error?.message, result.message, "Request failed"].find(Boolean)!
}
async function request<T = Record<string, unknown>>(path: string, body?: unknown) {
 const response = await fetch(path, body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
 if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('The workspace services are not connected yet.')
 const result = await response.json() as T & { error?: string | { message?: string }; message?: string }
 if (!response.ok) throw new Error(errorMessage(result))
 return result
}
const inputClass = "w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-emerald-300/60"
function useFactory() {
 const [user, setUser] = useState<User | null>(null)
 const [loading, setLoading] = useState(true)
 const [projects, setProjects] = useState<Project[]>([])
 const [tasks, setTasks] = useState<Task[]>([])
 const [selected, setSelected] = useState("")
 const [error, setError] = useState("")
 const [busy, setBusy] = useState(false)
 const [register, setRegister] = useState(false)
 const [plan, setPlan] = useState("")
 const [live, setLive] = useState(false)
 const [view, setView] = useState("work")
 const refresh = useCallback(async () => {
  const data = await request<{ projects: Project[]; tasks: Task[] }>("/api/projects")
  setProjects(data.projects); setTasks(data.tasks)
  setSelected(current => current || data.projects[0]?.id || "")
 }, [])
 useEffect(() => {
  request<{ user: User } | null>("/api/auth/get-session").then(async session => { if (session?.user) { setUser(session.user); await refresh() } }).catch(e => setError(e.message)).finally(() => setLoading(false))
 }, [refresh])
 useEffect(() => {
  if (!user) return
  let stopped = false
  let reconnect: ReturnType<typeof setTimeout>
  let events: WebSocket
  function connect() {
   events = new WebSocket(`${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/api/ws`)
   events.onopen = () => setLive(true)
   events.onerror = () => setLive(false)
   events.onclose = () => { setLive(false); if(!stopped) reconnect = setTimeout(connect, 5000) }
   events.onmessage = () => { void refresh().catch(e => setError(e.message)) }
  }
  connect()
  const poll = setInterval(() => { void refresh().catch(e => setError(e.message)) }, 15000)
  return () => { stopped = true; clearTimeout(reconnect); events.close(); clearInterval(poll) }
 }, [user, refresh])
 async function perform(action: () => Promise<void>) {
  setBusy(true); setError("")
  try { await action() } catch (e) { setError(e instanceof Error ? e.message : "Request failed") } finally { setBusy(false) }
 }
 async function authenticate(event: React.FormEvent<HTMLFormElement>) {
  event.preventDefault(); const data = new FormData(event.currentTarget)
  await perform(async () => { const result = await request<{ user: User }>(`/api/auth/${register ? "sign-up" : "sign-in"}/email`, { name: data.get("name"), email: data.get("email"), password: data.get("password") }); setUser(result.user); await refresh() })
 }
 async function createProject(event: React.FormEvent<HTMLFormElement>) {
  event.preventDefault(); const form = event.currentTarget; const data = new FormData(form)
  await perform(async () => { const project = await request<Project>("/api/projects", { name: data.get("name"), brief: data.get("brief") }); setSelected(project.id); await refresh(); form.reset() })
 }
 async function createTask(event: React.FormEvent<HTMLFormElement>) {
  event.preventDefault(); const form = event.currentTarget; const data = new FormData(form)
  await perform(async () => { await request("/api/tasks", { projectId: selected, title: data.get("title") }); await refresh(); form.reset() })
 }
 return { user, loading, projects, tasks, selected, error, busy, register, plan, live, view, setView, setSelected, setPlan, setRegister, setUser, setProjects, setTasks, perform, authenticate, createProject, createTask, refresh }
}
type FactoryState = ReturnType<typeof useFactory>

function Header({ factory }: { factory: FactoryState }) {
 const { user, perform, setUser, setProjects, setTasks, setSelected, setPlan } = factory
 
 return (  <header className="flex items-center justify-between border-b border-white/10 px-6 py-5 md:px-12">
   <div className="flex items-center gap-3"><div className="grid size-9 place-items-center rounded-lg bg-[#d0f3a6] font-mono text-lg font-bold text-[#101612]">A</div><span className="text-lg font-semibold tracking-tight">anhedral <span className="font-normal text-white/45">factory</span></span></div>
   <div className="flex items-center gap-4 text-xs text-white/50"><span className="rounded-full border border-white/15 px-3 py-1.5">EXAMPLE WORKSPACE</span>{user && <button onClick={() => void perform(async () => { await request("/api/auth/sign-out", {}); setUser(null); setProjects([]); setTasks([]); setSelected(""); setPlan("") })} className="hover:text-white">Sign out</button>}</div>
  </header>
)
}

function Introduction({ factory }: { factory: FactoryState }) {
 const { user, projects, live } = factory
 
 return (   <div className="mb-10 flex flex-wrap items-end justify-between gap-4"><div><p className="mb-3 font-mono text-xs tracking-[0.2em] text-[#d0f3a6]">FROM BRIEF TO DELIVERY</p><h1 className="text-4xl font-medium tracking-tight md:text-5xl">Your next project starts here.</h1><p className="mt-4 max-w-xl text-sm leading-6 text-white/45">A small, working software delivery workspace. Real projects, durable jobs, private reports, and a little help getting started.</p></div>{user && <span className="flex items-center gap-2 text-xs text-white/45"><i className={`size-2 rounded-full ${live ? "bg-[#d0f3a6]" : "bg-amber-300"}`} />{live ? "Live updates connected" : "Updates reconnecting"}</span>}</div>
)
}

function Login({ factory }: { factory: FactoryState }) {
 const { projects, busy, register, setRegister, authenticate } = factory
 
 const copy = register ? { title: "Create your workspace", action: "Create account", toggle: "Already have an account? Sign in", autocomplete: "new-password" } : { title: "Welcome back", action: "Sign in", toggle: "New here? Create an account", autocomplete: "current-password" }
 return (<div className="grid gap-10 md:grid-cols-2">
    <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-8"><p className="mb-6 text-xs text-white/40">01 / GET STARTED</p><h2 className="mb-2 text-2xl">{copy.title}</h2><p className="mb-6 text-sm text-white/45">Your projects and reports are private to your account.</p><form onSubmit={authenticate} className="space-y-4">{register && <input className={inputClass} name="name" placeholder="Your name" aria-label="Your name" required maxLength={100} />}<input className={inputClass} name="email" type="email" placeholder="Email address" aria-label="Email address" required autoComplete="email" /><input className={inputClass} name="password" type="password" placeholder="Password" aria-label="Password" required minLength={12} maxLength={128} autoComplete={copy.autocomplete} /><Button type="submit" disabled={busy} className="w-full bg-[#d0f3a6] py-6 text-[#101612] hover:bg-[#bce98e]">{busy ? "Please wait…" : copy.action}</Button></form><button className="mt-5 text-sm text-white/50 hover:text-white" onClick={() => setRegister(!register)}>{copy.toggle}</button><p className="mt-6 text-xs leading-5 text-white/30">Use an example account. This workspace demonstrates the stack and does not deliver production code.</p></section>
    <section className="p-4 md:p-8"><p className="mb-8 font-mono text-xs text-white/35">A COMPLETE DELIVERY EXERCISE</p>{[["01", "Capture the brief", "Create a project with a clear outcome."], ["02", "Plan the work", "Draft a task list with Workers AI."], ["03", "Run a delivery", "A durable job writes a private report and updates your workspace."]].map(([n,title,detail]) => <div key={n} className="mb-8 flex gap-5"><span className="font-mono text-sm text-[#d0f3a6]">{n}</span><div><h3 className="mb-2 text-lg">{title}</h3><p className="text-sm text-white/40">{detail}</p></div></div>)}</section>
   </div>)
}

function Navigation({ factory }: { factory: FactoryState }) {
 const { user, view, setView } = factory
 
 return (    <nav className="mb-8 flex gap-6 border-b border-white/10 text-sm"><button className={`pb-3 ${view === "work" ? "border-b border-[#d0f3a6] text-[#d0f3a6]" : "text-white/40"}`} onClick={() => setView("work")}>Workspace</button><button className={`pb-3 ${view === "stack" ? "border-b border-[#d0f3a6] text-[#d0f3a6]" : "text-white/40"}`} onClick={() => setView("stack")}>About this example</button><span className="ml-auto text-xs text-white/40">{user?.name}</span></nav>
)
}

function About(){return (<section className="rounded-2xl border border-white/10 p-8"><h2 className="mb-4 text-2xl">Built on the Anhedral standard</h2><p className="max-w-2xl text-sm leading-7 text-white/45">The web app runs on Cloudflare Workers with a shared Hono API. Neon stores accounts and projects through Hyperdrive. Queues starts durable Workflows, R2 keeps delivery reports private, and Durable Objects sends live updates. A scheduled Worker records an hourly service heartbeat. AI drafts plans; it does not run code or approve releases.</p><p className="mt-5 text-sm text-white/45">A delivery report confirms the infrastructure exercise. Production software delivery, billing, email delivery, and third-party analytics activation require their own configuration and verification.</p></section>)}

function Projects({ factory }: { factory: FactoryState }) {
 const { projects, selected, setSelected, setPlan, busy, createProject } = factory
 
 return (     <aside className="rounded-2xl border border-white/10 p-6"><h2 className="mb-5 text-xs uppercase tracking-widest text-white/40">Projects / {projects.length}</h2><div className="mb-8 space-y-2">{projects.map(p => <button key={p.id} onClick={() => { setSelected(p.id); setPlan("") }} className={`w-full rounded-xl px-4 py-3 text-left text-sm ${selected === p.id ? "bg-[#d0f3a6]/10 text-[#d0f3a6]" : "text-white/50 hover:bg-white/5"}`}>{p.name}</button>)}</div><form onSubmit={createProject} className="space-y-3"><h3 className="text-sm">New project</h3><input name="name" aria-label="Project name" placeholder="Project name" className={inputClass} required maxLength={100} /><textarea name="brief" aria-label="Project brief" placeholder="What are we building?" className={inputClass} rows={3} maxLength={2000} required /><Button type="submit" disabled={busy} className="w-full bg-white/10 text-white hover:bg-white/20">Create project</Button></form></aside>
)
}

function Plan({ factory, project }: { factory: FactoryState; project: Project }) {
 const { setPlan, plan, busy, perform } = factory
 
 return (<><Button disabled={busy} onClick={() => void perform(async () => { const result = await request<{ plan: string | { response?: string } }>("/api/plan", { brief: project.brief }); setPlan(typeof result.plan === "string" ? result.plan : result.plan.response ?? JSON.stringify(result.plan)) })} className="mb-6 border border-[#d0f3a6]/20 bg-[#d0f3a6]/10 text-[#d0f3a6] hover:bg-[#d0f3a6]/20">Draft a plan with AI</Button>{plan && <div className="mb-6 rounded-xl border border-[#d0f3a6]/20 bg-[#d0f3a6]/5 p-5"><p className="mb-3 text-xs text-[#d0f3a6]">DRAFT PLAN · REVIEW BEFORE USE</p><p className="whitespace-pre-wrap text-sm leading-7 text-white/65">{plan}</p></div>}</>)
}

function TaskList({ factory, tasks }: { factory: FactoryState; tasks: Task[] }) {
 const { perform, refresh } = factory
 
 return (<div className="space-y-3">{tasks.map(task => <div key={task.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 p-4"><div><p className="text-sm">{task.title}</p><p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-white/35">{task.status.replaceAll("_", " ")}</p></div>{task.reportKey && <a href={`/api/tasks/${task.id}/report`} className="text-xs text-[#d0f3a6] hover:underline">Download report ↗</a>}{task.status === "dispatch_failed" && <button onClick={() => void perform(async () => { await request(`/api/tasks/${task.id}/retry`, {}); await refresh() })} className="text-xs text-[#d0f3a6]">Retry delivery</button>}</div>)}{!tasks.length && <p className="py-10 text-center text-sm text-white/30">Your first delivery task will appear here.</p>}</div>)
}

function Workspace({ factory }: { factory: FactoryState }) {
 const { projects, tasks, selected, busy, createTask } = factory
 const project = projects.find(p => p.id === selected); const visibleTasks = tasks.filter(task => task.projectId === selected)
 return (     <section className="rounded-2xl border border-white/10 p-6 md:p-8">{project ? <><div className="mb-7 flex items-start justify-between gap-4"><div><p className="mb-2 font-mono text-xs text-[#d0f3a6]">PROJECT WORKSPACE</p><h2 className="text-2xl tracking-tight">{project.name}</h2><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-white/45">{project.brief}</p></div><span className="rounded-full bg-white/5 px-3 py-1.5 text-xs text-white/40">{visibleTasks.length} tasks</span></div><Plan factory={factory} project={project} /><form onSubmit={createTask} className="mb-8 flex gap-3"><input className={inputClass} name="title" placeholder="Describe a delivery task…" aria-label="Delivery task" required maxLength={500} /><Button type="submit" disabled={busy} className="h-auto bg-[#d0f3a6] text-[#101612] hover:bg-[#bce98e]">Run delivery</Button></form><TaskList factory={factory} tasks={visibleTasks} /></> : <div className="grid min-h-80 place-items-center text-center"><div><p className="mb-3 text-2xl">Room for what comes next.</p><p className="text-sm text-white/40">Create a project to start planning and delivering.</p></div></div>}</section>)
}

function Content({factory}:{factory:FactoryState}) {
 if(factory.loading)return <p className="text-white/50">Opening your workspace…</p>
 if(!factory.user)return <Login factory={factory}/>
 return <><Navigation factory={factory}/>{factory.view==='stack'?<About/>:<div className="grid gap-6 lg:grid-cols-[300px_1fr]"><Projects factory={factory}/><Workspace factory={factory}/></div>}</>
}
export default function Factory() {
 const factory=useFactory()
 return <main className="min-h-screen bg-[#101612] text-[#f1f5ee] selection:bg-emerald-300/30"><Header factory={factory}/><div className="mx-auto max-w-7xl px-6 py-12 md:px-12 md:py-16"><Introduction factory={factory}/>{factory.error && <p role="alert" className="mb-6 rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">{factory.error}</p>}<Content factory={factory}/>   <footer className="mt-12 flex justify-between border-t border-white/10 pt-5 font-mono text-[10px] uppercase tracking-widest text-white/25"><span>Anhedral / Factory</span><span>Make something worth shipping.</span></footer></div></main>
}
