import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Activity, AlertCircle, ArrowRight, ArrowUpRight, Box, Check, CheckCircle2, ChevronDown, CircleHelp, Clock3, Command, Copy, Ellipsis, FileJson2, Filter, Gauge, GitBranch, Layers3, LoaderCircle, Menu, MoreHorizontal, Plus, Radio, RefreshCw, Search, Settings2, ShieldCheck, Sparkles, Trash2, Waypoints, Workflow, X, Zap } from 'lucide-react'
import { connectorsApi, workflowsApi } from './api'
import WorkflowGraphEditor from './WorkflowGraphEditor'
import type { ApiDefinition, ApiDefinitionInput, ExtractedField, FieldType, HttpMethod, WorkflowDefinition, WorkflowExecutionLog, WorkflowInput } from './types'

type View = 'overview' | 'workflows' | 'connectors' | 'runs'
type Draft<T> = T | 'new' | null
const methods: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
const fieldTypes: FieldType[] = ['STRING', 'INTEGER', 'DECIMAL', 'BOOLEAN', 'OBJECT']
const titles: Record<View, string> = { overview: 'Visão geral', workflows: 'Meus fluxos', connectors: 'Conectores', runs: 'Execuções' }

function starterSteps(connectorId: string) {
  const id = 'step_consulta'
  return JSON.stringify({ [id]: { type: 'API_CALL', id, name: 'Consulta inicial', apiDefinitionId: connectorId, inputMappings: {}, retryPolicy: { maxAttempts: 1, backoffMillis: 0 }, nextStepId: null, onErrorStepId: null } }, null, 2)
}
function triggerPayloadTemplate(workflow: WorkflowDefinition): Record<string, unknown> {
  const fields = new Set<string>()
  const triggerReference = /#trigger(?:\[['"]([^'"]+)['"]\]|\.([A-Za-z_$][\w$]*))/g
  for (const step of Object.values(workflow.steps)) {
    const expressions = step.type === 'API_CALL'
      ? Object.values(step.inputMappings)
      : step.rules.map((rule) => rule.spelExpression)
    for (const expression of expressions) {
      for (const match of expression.matchAll(triggerReference)) {
        fields.add(match[1] ?? match[2])
      }
    }
  }
  return Object.fromEntries([...fields].sort().map((field) => [field, '']))
}
function shellQuote(value: string) {
  return `'${value.replace(/'/g, "'\\''")}'`
}
function errorMessage(error: unknown) { return error instanceof Error ? error.message : 'Não foi possível concluir a operação.' }
function dateLabel(value: string) { return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value)) }
function containsCycle(steps: WorkflowInput['steps']) {
  const visited = new Set<string>()
  const active = new Set<string>()
  const visit = (id: string): boolean => {
    if (active.has(id)) return true
    if (visited.has(id)) return false
    const step = steps[id]
    if (!step) return false
    active.add(id)
    const nextIds = step.type === 'API_CALL'
      ? [step.nextStepId, step.onErrorStepId]
      : [step.onPassStepId, step.onFailStepId]
    for (const nextId of nextIds) {
      if (nextId && steps[nextId] && visit(nextId)) return true
    }
    active.delete(id)
    visited.add(id)
    return false
  }
  return Object.keys(steps).some(visit)
}

export default function Console() {
  const [view, setView] = useState<View>('overview')
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([])
  const [connectors, setConnectors] = useState<ApiDefinition[]>([])
  const [runs, setRuns] = useState<WorkflowExecutionLog[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [online, setOnline] = useState(false)
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState<{ error: boolean; message: string } | null>(null)
  const [connectorDraft, setConnectorDraft] = useState<Draft<ApiDefinition>>(null)
  const [workflowDraft, setWorkflowDraft] = useState<Draft<WorkflowDefinition>>(null)
  const [runTarget, setRunTarget] = useState<WorkflowDefinition | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ kind: 'connector' | 'workflow'; id: string } | null>(null)
  const [mobileNav, setMobileNav] = useState(false)

  const refresh = async (quiet = false) => {
    if (quiet) setRefreshing(true)
    const [flows, apis] = await Promise.allSettled([workflowsApi.list(), connectorsApi.list()])
    const flowOk = flows.status === 'fulfilled'
    const apiOk = apis.status === 'fulfilled'
    if (flowOk) setWorkflows(flows.value)
    if (apiOk) setConnectors(apis.value)
    setOnline(flowOk || apiOk)
    if (!flowOk && !apiOk) setNotice({ error: true, message: 'API indisponível. Confira o host automation-v1.' })
    setLoading(false)
    setRefreshing(false)
  }
  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh() }, 0)
    return () => window.clearTimeout(timer)
  }, [])
  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 4200)
    return () => window.clearTimeout(timer)
  }, [notice])

  const filteredWorkflows = useMemo(() => workflows.filter((item) => item.name.toLowerCase().includes(query.toLowerCase())), [query, workflows])
  const filteredConnectors = useMemo(() => connectors.filter((item) => item.name.toLowerCase().includes(query.toLowerCase())), [connectors, query])
  const activeFlows = workflows.filter((item) => item.active).length

  const saveConnector = async (input: ApiDefinitionInput) => {
    try {
      const saved = connectorDraft && connectorDraft !== 'new' ? await connectorsApi.update(connectorDraft.id, input) : await connectorsApi.create(input)
      setConnectors((current) => [saved, ...current.filter((item) => item.id !== saved.id)])
      setConnectorDraft(null)
      setNotice({ error: false, message: 'Conector salvo com sucesso.' })
    } catch (error) { setNotice({ error: true, message: errorMessage(error) }) }
  }
  const saveWorkflow = async (input: WorkflowInput) => {
    try {
      const saved = workflowDraft && workflowDraft !== 'new' ? await workflowsApi.update(workflowDraft.id, input) : await workflowsApi.create(input)
      setWorkflows((current) => [saved, ...current.filter((item) => item.id !== saved.id)])
      setWorkflowDraft(null)
      setNotice({ error: false, message: 'Fluxo salvo com sucesso.' })
    } catch (error) { setNotice({ error: true, message: errorMessage(error) }) }
  }
  const removeItem = async () => {
    if (!deleteTarget) return
    try {
      if (deleteTarget.kind === 'connector') {
        await connectorsApi.remove(deleteTarget.id)
        setConnectors((items) => items.filter((item) => item.id !== deleteTarget.id))
      } else {
        await workflowsApi.remove(deleteTarget.id)
        setWorkflows((items) => items.filter((item) => item.id !== deleteTarget.id))
      }
      setNotice({ error: false, message: 'Item removido.' })
    } catch (error) { setNotice({ error: true, message: errorMessage(error) }) }
    setDeleteTarget(null)
  }
  const execute = async (workflow: WorkflowDefinition, payload: Record<string, unknown>) => {
    const result = await workflowsApi.trigger(workflow.id, payload)
    setRuns((items) => [result, ...items])
    return result
  }

  const nav = <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
    <a className="brand" href="#inicio" onClick={() => setView('overview')} aria-label="Bolt Mesh início"><span className="brand-mark"><Workflow size={20} /></span><span className="brand-word">Bolt<span> Mesh</span></span></a>
    <button className="workspace-switch" onClick={() => setNotice({ error: false, message: 'Este ambiente usa o tenant enviado em cada cadastro.' })}><span className="workspace-avatar">V</span><span><b>Workspace principal</b><small>Ambiente de produção</small></span><ChevronDown size={14} /></button>
    <div className="nav-caption">ESPAÇO DE TRABALHO</div>
    <nav className="sidebar-nav" aria-label="Navegação principal">
      <NavButton icon={<Gauge size={17} />} label="Visão geral" active={view === 'overview'} onClick={() => { setView('overview'); setMobileNav(false) }} />
      <NavButton icon={<Workflow size={17} />} label="Meus fluxos" count={workflows.length} active={view === 'workflows'} onClick={() => { setView('workflows'); setMobileNav(false) }} />
      <NavButton icon={<Box size={17} />} label="Conectores" count={connectors.length} active={view === 'connectors'} onClick={() => { setView('connectors'); setMobileNav(false) }} />
      <NavButton icon={<Activity size={17} />} label="Execuções" count={runs.length} active={view === 'runs'} onClick={() => { setView('runs'); setMobileNav(false) }} />
    </nav>
    <div className="sidebar-bottom"><div className="help-box"><span className="help-icon"><CircleHelp size={16} /></span><b>Precisa de ajuda?</b><small>Consulte a documentação da plataforma.</small><button onClick={() => setNotice({ error: false, message: 'Consulte o SKILL.md deste projeto para a documentação da API.' })}>Ver documentação <ArrowUpRight size={13} /></button></div><div className="profile-row"><span className="profile-avatar">BM</span><span><b>Bolt Mesh</b><small>Administrador</small></span><MoreHorizontal size={17} /></div></div>
  </aside>

  return <div className="app-shell">{nav}{mobileNav && <button className="mobile-scrim" aria-label="Fechar navegação" onClick={() => setMobileNav(false)} />}<main className="main-area">
    <header className="topbar"><button className="icon-button mobile-menu" aria-label="Abrir navegação" onClick={() => setMobileNav(true)}><Menu size={19} /></button><div className="breadcrumbs"><span>Workspace</span><i>/</i><b>{titles[view]}</b></div><div className="topbar-tools"><label className="search-box"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar fluxos e conectores" /><kbd><Command size={10} /> K</kbd></label><span className={`api-state ${online ? 'is-online' : ''}`}><i />{online ? 'API conectada' : 'API desconectada'}</span><button className="icon-button top-help" aria-label="Ajuda" onClick={() => setNotice({ error: false, message: 'A aplicação acessa /java/engine-bolt-mesh/api/v1 pelo proxy local.' })}><CircleHelp size={17} /></button></div></header>
    <div className="page-content">
      {view === 'overview' && <Overview workflows={workflows} connectors={connectors} runs={runs} activeFlows={activeFlows} loading={loading} refreshing={refreshing} onRefresh={() => void refresh(true)} onView={setView} onCreate={() => setWorkflowDraft('new')} onEdit={setWorkflowDraft} onRun={setRunTarget} />}
      {view === 'workflows' && <WorkflowList workflows={filteredWorkflows} loading={loading} onCreate={() => setWorkflowDraft('new')} onEdit={setWorkflowDraft} onRun={setRunTarget} onDelete={(id) => setDeleteTarget({ kind: 'workflow', id })} onRefresh={() => void refresh(true)} />}
      {view === 'connectors' && <ConnectorList connectors={filteredConnectors} workflows={workflows} loading={loading} onCreate={() => setConnectorDraft('new')} onEdit={setConnectorDraft} onDelete={(id) => setDeleteTarget({ kind: 'connector', id })} onRefresh={() => void refresh(true)} />}
      {view === 'runs' && <RunHistory runs={runs} workflows={workflows} onViewFlows={() => setView('workflows')} />}
    </div>
  </main>{connectorDraft && <ConnectorDialog draft={connectorDraft} onClose={() => setConnectorDraft(null)} onSave={saveConnector} />}{workflowDraft && <WorkflowDialog draft={workflowDraft} connectors={connectors} onClose={() => setWorkflowDraft(null)} onSave={saveWorkflow} />}{runTarget && <RunDialog workflow={runTarget} onClose={() => setRunTarget(null)} onRun={execute} />}{deleteTarget && <ConfirmDialog target={deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={() => void removeItem()} />}{notice && <div className={`toast ${notice.error ? 'toast-error' : ''}`} role="status"><span>{notice.error ? <AlertCircle size={17} /> : <CheckCircle2 size={17} />}</span>{notice.message}<button aria-label="Fechar aviso" onClick={() => setNotice(null)}><X size={15} /></button></div>}</div>
}

function NavButton({ icon, label, count, active, onClick }: { icon: ReactNode; label: string; count?: number; active: boolean; onClick: () => void }) {
  return <button className={`nav-item ${active ? 'nav-item-active' : ''}`} onClick={onClick}>{icon}<span>{label}</span>{count !== undefined && <small>{count}</small>}</button>
}
function Heading({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{actions && <div className="heading-actions">{actions}</div>}</div>
}
function Metric({ icon, label, value, detail, tone }: { icon: ReactNode; label: string; value: string | number; detail: string; tone: string }) {
  return <article className="metric-card"><span className={`metric-icon ${tone}`}>{icon}</span><span className="metric-label">{label}</span><strong>{value}</strong><small>{detail}</small></article>
}
function Overview({ workflows, connectors, runs, activeFlows, loading, refreshing, onRefresh, onView, onCreate, onEdit, onRun }: { workflows: WorkflowDefinition[]; connectors: ApiDefinition[]; runs: WorkflowExecutionLog[]; activeFlows: number; loading: boolean; refreshing: boolean; onRefresh: () => void; onView: (view: View) => void; onCreate: () => void; onEdit: (item: WorkflowDefinition) => void; onRun: (item: WorkflowDefinition) => void }) {
  return <><Heading eyebrow="CENTRAL DE AUTOMAÇÃO" title="Visão geral" description="Acompanhe e orquestre suas automações em um só lugar." actions={<><button className="button button-quiet" onClick={onRefresh}><RefreshCw size={15} className={refreshing ? 'spin' : ''} /> Atualizar</button><button className="button button-primary" onClick={onCreate}><Plus size={16} /> Criar fluxo</button></>} />
    <section className="welcome-band"><div className="welcome-copy"><span className="welcome-label"><Sparkles size={14} /> AUTOMAÇÃO COM PROPÓSITO</span><h2>Menos tarefas manuais.<br /><em>Mais tempo para o que importa.</em></h2><p>Conecte sistemas, defina regras e deixe seus processos fluírem.</p><button className="welcome-button" onClick={onCreate}><Plus size={15} /> Nova automação <ArrowRight size={15} /></button></div><div className="flow-art" aria-hidden="true"><div className="art-line art-line-a" /><div className="art-line art-line-b" /><div className="art-line art-line-c" /><div className="art-node art-trigger"><Radio size={18} /><small>Gatilho</small></div><div className="art-node art-api"><Box size={18} /><small>Conector</small></div><div className="art-node art-rule"><GitBranch size={18} /><small>Regra</small></div><div className="art-node art-done"><Check size={18} /><small>Concluído</small></div><span className="art-pulse" /></div><span className="welcome-index">01 <i>/</i> FLUXOS</span></section>
    <section className="metric-grid"><Metric icon={<Workflow size={17} />} label="Fluxos ativos" value={activeFlows} detail={`${workflows.length} no total`} tone="tone-pink" /><Metric icon={<Box size={17} />} label="Conectores" value={connectors.length} detail="Integrações disponíveis" tone="tone-violet" /><Metric icon={<Activity size={17} />} label="Execuções recentes" value={runs.length} detail="Nesta sessão" tone="tone-green" /><Metric icon={<ShieldCheck size={17} />} label="Taxa de sucesso" value={runs.length ? `${Math.round(runs.filter((run) => run.status === 'COMPLETED').length / runs.length * 100)}%` : '—'} detail="Com base nas execuções" tone="tone-amber" /></section>
    <section className="overview-columns"><div className="panel"><div className="panel-heading"><div><h3>Fluxos recentes</h3><p>Seus processos automatizados</p></div><button className="text-action" onClick={() => onView('workflows')}>Ver todos <ArrowRight size={14} /></button></div>{loading ? <Loading /> : workflows.length ? <WorkflowTable workflows={workflows.slice(0, 5)} compact onEdit={onEdit} onRun={onRun} /> : <Empty icon={<Workflow size={19} />} title="Nenhum fluxo por aqui" detail="Crie seu primeiro fluxo para começar a automatizar processos." action={<button className="button button-primary button-small" onClick={onCreate}><Plus size={14} /> Criar primeiro fluxo</button>} />}</div>
      <div className="panel activity-panel"><div className="panel-heading"><div><h3>Atividade</h3><p>Execuções desta sessão</p></div><button className="icon-button" aria-label="Ver execuções" onClick={() => onView('runs')}><ArrowUpRight size={16} /></button></div>{runs.length ? <div>{runs.slice(0, 4).map((run) => <ActivityRow key={run.id} run={run} workflows={workflows} />)}</div> : <div className="activity-empty"><span><Clock3 size={18} /></span><b>Tudo tranquilo por enquanto</b><small>Quando um fluxo rodar, você verá os detalhes aqui.</small><button className="text-action" onClick={() => onView('runs')}>Abrir execuções <ArrowRight size={13} /></button></div>}<div className="activity-footer"><span><i /> {runs.length ? 'Monitoramento ativo' : 'Aguardando atividade'}</span><button onClick={() => onView('runs')}>Histórico <ArrowRight size={13} /></button></div></div></section>
    <div className="footer-note"><b>Bolt Mesh</b><span>•</span><span>Automação com propósito</span><small>{loading ? 'Sincronizando dados' : `${workflows.length + connectors.length} recursos sincronizados`}</small></div>
  </>
}
function Empty({ icon, title, detail, action }: { icon: ReactNode; title: string; detail: string; action?: ReactNode }) {
  return <div className="empty-state"><span>{icon}</span><b>{title}</b><p>{detail}</p>{action}</div>
}
function Loading() { return <div className="loading"><LoaderCircle size={18} className="spin" /> Carregando dados...</div> }
function WorkflowList({ workflows, loading, onCreate, onEdit, onRun, onDelete, onRefresh }: { workflows: WorkflowDefinition[]; loading: boolean; onCreate: () => void; onEdit: (item: WorkflowDefinition) => void; onRun: (item: WorkflowDefinition) => void; onDelete: (id: string) => void; onRefresh: () => void }) {
  return <><Heading eyebrow="ORQUESTRAÇÃO" title="Meus fluxos" description="Crie, organize e acompanhe seus processos automatizados." actions={<><button className="button button-quiet" onClick={onRefresh}><RefreshCw size={15} /> Atualizar</button><button className="button button-primary" onClick={onCreate}><Plus size={16} /> Novo fluxo</button></>} /><div className="toolbar"><div><Workflow size={17} /><b>Todos os fluxos</b><span className="count-pill">{workflows.length}</span></div><div><button className="button button-quiet button-small"><Filter size={14} /> Filtros <ChevronDown size={13} /></button><button className="button button-quiet button-small" onClick={onRefresh}><RefreshCw size={14} /> Sincronizar</button></div></div><div className="panel list-panel">{loading ? <Loading /> : workflows.length ? <WorkflowTable workflows={workflows} onEdit={onEdit} onRun={onRun} onDelete={onDelete} /> : <Empty icon={<Workflow size={19} />} title="Você ainda não criou fluxos" detail="Comece conectando um processo e transforme uma tarefa repetitiva em automação." action={<button className="button button-primary button-small" onClick={onCreate}><Plus size={14} /> Criar fluxo</button>} />}</div><div className="list-note"><ShieldCheck size={14} /> Seus fluxos são executados com segurança pelo engine de automação.</div></>
}
function WorkflowTable({ workflows, compact = false, onEdit, onRun, onDelete }: { workflows: WorkflowDefinition[]; compact?: boolean; onEdit: (item: WorkflowDefinition) => void; onRun: (item: WorkflowDefinition) => void; onDelete?: (id: string) => void }) {
  return <div className={`table-scroll ${compact ? 'compact-table' : ''}`}><table className="data-table"><thead><tr><th>Nome do fluxo</th><th>Status</th>{!compact && <th>Versão</th>}<th>Etapas</th><th>Atualizado</th><th /></tr></thead><tbody>{workflows.map((item) => <tr key={item.id}><td><button className="table-name" onClick={() => onEdit(item)}><span className="flow-symbol"><Waypoints size={16} /></span><span><b>{item.name}</b><small>{item.id.slice(0, 8)} · {item.firstStepId}</small></span></button></td><td><span className={`state-pill ${item.active ? 'active' : 'inactive'}`}><i />{item.active ? 'Ativo' : 'Inativo'}</span></td>{!compact && <td>v{item.version}</td>}<td><span className="step-count"><Layers3 size={13} /> {Object.keys(item.steps).length} etapas</span></td><td>{dateLabel(item.updatedAt || item.createdAt)}</td><td><div className="row-actions"><button className="row-icon run-action" title="Executar" aria-label={`Executar ${item.name}`} onClick={() => onRun(item)}><Zap size={15} /></button><button className="row-icon" title="Editar" aria-label={`Editar ${item.name}`} onClick={() => onEdit(item)}><Settings2 size={15} /></button>{onDelete && <button className="row-icon danger" title="Excluir" aria-label={`Excluir ${item.name}`} onClick={() => onDelete(item.id)}><Trash2 size={14} /></button>}</div></td></tr>)}</tbody></table></div>
}
function ConnectorList({ connectors, workflows, loading, onCreate, onEdit, onDelete, onRefresh }: { connectors: ApiDefinition[]; workflows: WorkflowDefinition[]; loading: boolean; onCreate: () => void; onEdit: (item: ApiDefinition) => void; onDelete: (id: string) => void; onRefresh: () => void }) {
  const usage = (id: string) => workflows.reduce((sum, workflow) => sum + Object.values(workflow.steps).filter((step) => step.type === 'API_CALL' && step.apiDefinitionId === id).length, 0)
  return <><Heading eyebrow="INTEGRAÇÕES" title="Conectores" description="Gerencie as APIs externas usadas pelos seus fluxos." actions={<><button className="button button-quiet" onClick={onRefresh}><RefreshCw size={15} /> Atualizar</button><button className="button button-primary" onClick={onCreate}><Plus size={16} /> Novo conector</button></>} /><div className="connector-intro"><span><Box size={18} /></span><div><b>Uma conexão, vários processos.</b><small>Defina a chamada da API e mapeie os campos que seus fluxos precisam.</small></div><label>{connectors.length} conectores</label></div>{loading ? <div className="panel"><Loading /></div> : connectors.length ? <div className="connector-grid">{connectors.map((item, index) => <ConnectorCard key={item.id} connector={item} index={index} usage={usage(item.id)} onEdit={() => onEdit(item)} onDelete={() => onDelete(item.id)} />)}</div> : <div className="panel"><Empty icon={<Box size={19} />} title="Nenhum conector cadastrado" detail="Adicione uma API para conectar seus fluxos aos sistemas que sua equipe já usa." action={<button className="button button-primary button-small" onClick={onCreate}><Plus size={14} /> Adicionar conector</button>} /></div>}</>
}
function ConnectorCard({ connector, index, usage, onEdit, onDelete }: { connector: ApiDefinition; index: number; usage: number; onEdit: () => void; onDelete: () => void }) {
  const palette = ['connector-pink', 'connector-orange', 'connector-green', 'connector-violet']
  return <article className="connector-card"><div className="connector-card-top"><span className={`connector-logo ${palette[index % palette.length]}`}><Box size={18} /></span><button className="icon-button" aria-label={`Editar ${connector.name}`} onClick={onEdit}><Ellipsis size={18} /></button></div><b>{connector.name}</b><small className="connector-url" title={connector.baseUrl}>{connector.baseUrl}</small><div className="connector-tags"><span className={`method-tag method-${connector.httpMethod.toLowerCase()}`}>{connector.httpMethod}</span><span><FileJson2 size={12} /> {connector.extractedFields.length} campos</span></div><div className="connector-card-footer"><small><i /> {usage ? `Usado em ${usage} etapa${usage > 1 ? 's' : ''}` : 'Ainda não utilizado'}</small><div><button onClick={onEdit}>Editar</button><button className="delete-card" aria-label={`Excluir ${connector.name}`} onClick={onDelete}><Trash2 size={14} /></button></div></div></article>
}
function ActivityRow({ run, workflows }: { run: WorkflowExecutionLog; workflows: WorkflowDefinition[] }) {
  const name = workflows.find((item) => item.id === run.workflowId)?.name || 'Fluxo removido'
  return <div className="activity-row"><span className={run.status === 'COMPLETED' ? 'activity-ok' : 'activity-fail'}>{run.status === 'COMPLETED' ? <Check size={13} /> : <X size={13} />}</span><div><b>{name}</b><small>{run.stepTraces.length} etapas · {new Date(run.startedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</small></div><small>{run.stepTraces.reduce((sum, item) => sum + item.durationMs, 0)} ms</small></div>
}
function RunHistory({ runs, workflows, onViewFlows }: { runs: WorkflowExecutionLog[]; workflows: WorkflowDefinition[]; onViewFlows: () => void }) {
  const name = (id: string) => workflows.find((item) => item.id === id)?.name || 'Fluxo removido'
  return <><Heading eyebrow="OBSERVABILIDADE" title="Execuções" description="Acompanhe os resultados e detalhes de cada execução." actions={<button className="button button-quiet" onClick={onViewFlows}><Workflow size={15} /> Ver fluxos</button>} /><section className="run-summary"><div><small>Execuções nesta sessão</small><b>{runs.length}</b></div><div><small>Concluídas</small><b className="summary-green">{runs.filter((run) => run.status === 'COMPLETED').length}</b></div><div><small>Com falha</small><b className="summary-red">{runs.filter((run) => run.status === 'FAILED').length}</b></div><p><Clock3 size={15} /> O backend não oferece listagem de logs. Os dados ficam disponíveis nesta sessão.</p></section><div className="panel run-panel"><div className="panel-heading"><div><h3>Histórico de execuções</h3><p>Resultado do disparo de workflows</p></div><span className="count-pill">{runs.length}</span></div>{runs.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Fluxo</th><th>Resultado</th><th>Etapas</th><th>Início</th><th>Duração</th></tr></thead><tbody>{runs.map((run) => <tr key={run.id}><td><b>{name(run.workflowId)}</b></td><td><span className={`state-pill ${run.status === 'COMPLETED' ? 'active' : 'failed'}`}><i />{run.status === 'COMPLETED' ? 'Concluído' : 'Falhou'}</span></td><td>{run.stepTraces.length} etapas</td><td>{new Date(run.startedAt).toLocaleString('pt-BR')}</td><td>{run.stepTraces.reduce((sum, item) => sum + item.durationMs, 0)} ms</td></tr>)}</tbody></table></div> : <Empty icon={<Activity size={19} />} title="Nenhuma execução registrada" detail="Execute um fluxo para acompanhar o resultado e a duração de cada etapa." action={<button className="button button-primary button-small" onClick={onViewFlows}><Zap size={14} /> Abrir fluxos</button>} />}</div></>
}

function Modal({ title, description, onClose, children, wide = false }: { title: string; description: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}><header className="modal-header"><div><h2>{title}</h2><p>{description}</p></div><button className="icon-button" aria-label="Fechar" onClick={onClose}><X size={17} /></button></header>{children}</section></div>
}
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="form-field"><span>{label}</span>{children}</label> }

type HeaderEntry = { id: string; name: string; value: string }
type BodyEntry = { id: string; key: string; value: string; mode: "text" | "raw" }

function makeHeaderEntries(headers: Record<string, string> | null): HeaderEntry[] {
  return Object.entries(headers ?? {}).map(([name, value], index) => ({
    id: String(index),
    name,
    value,
  }))
}

function makeBodyEntries(template: string): BodyEntry[] | null {
  if (!template.trim()) return []
  try {
    const parsed: unknown = JSON.parse(template)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null
    return Object.entries(parsed as Record<string, unknown>).map(([key, value], index) => ({
      id: String(index),
      key,
      value: typeof value === "string" ? value : JSON.stringify(value),
      mode: typeof value === "string" ? "text" : "raw",
    }))
  } catch {
    return null
  }
}

function serializeBodyEntries(entries: BodyEntry[]): string {
  const fields = entries.filter((entry) => entry.key.trim()).map((entry) => {
    const value = entry.mode === "text" ? JSON.stringify(entry.value) : entry.value.trim() || "null"
    return `  ${JSON.stringify(entry.key.trim())}: ${value}`
  })
  return fields.length ? `{\n${fields.join(",\n")}\n}` : "{}"
}

function headersFromEntries(entries: HeaderEntry[]): Record<string, string> {
  return Object.fromEntries(entries.filter((entry) => entry.name.trim()).map((entry) => [entry.name.trim(), entry.value]))
}

function duplicateHeaderName(entries: HeaderEntry[]): boolean {
  const names = entries.map((entry) => entry.name.trim().toLowerCase()).filter(Boolean)
  return new Set(names).size !== names.length
}

function isJsonValue(value: string): boolean {
  try {
    JSON.parse(value)
    return true
  } catch {
    return false
  }
}

function ConnectorDialog({
  draft,
  onClose,
  onSave,
}: {
  draft: Exclude<Draft<ApiDefinition>, null>;
  onClose: () => void;
  onSave: (input: ApiDefinitionInput) => Promise<void>;
}) {
  const editing = draft !== "new";
  const [tenantId, setTenantId] = useState(editing ? draft.tenantId : "");
  const [name, setName] = useState(editing ? draft.name : "");
  const [url, setUrl] = useState(editing ? draft.baseUrl : "https://");
  const [method, setMethod] = useState<HttpMethod>(
    editing ? draft.httpMethod : "GET",
  );
  const [headerEntries, setHeaderEntries] = useState<HeaderEntry[]>(() =>
    makeHeaderEntries(editing ? draft.headersTemplate : null),
  );
  const [body, setBody] = useState(editing ? draft.bodyTemplate || "" : "");
  const [bodyMode, setBodyMode] = useState<"visual" | "json">(() =>
    makeBodyEntries(editing ? draft.bodyTemplate || "" : "") === null ? "json" : "visual",
  );
  const [bodyEntries, setBodyEntries] = useState<BodyEntry[]>(() =>
    makeBodyEntries(editing ? draft.bodyTemplate || "" : "") ?? [],
  );
  const [bodyAdvancedDirty, setBodyAdvancedDirty] = useState(() =>
    makeBodyEntries(editing ? draft.bodyTemplate || "" : "") === null,
  );
  const [fields, setFields] = useState<ExtractedField[]>(
    editing ? draft.extractedFields : [],
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const updateBodyEntries = (entries: BodyEntry[]) => {
    setBodyEntries(entries);
    setBody(serializeBodyEntries(entries));
  };
  const changeBodyMode = (mode: "visual" | "json") => {
    if (mode === "visual" && bodyAdvancedDirty) {
      const entries = makeBodyEntries(body);
      if (entries === null) {
        setError("O modo visual aceita um objeto JSON. Use JSON avançado para estruturas diferentes.");
        return;
      }
      setBodyEntries(entries);
      setBody(serializeBodyEntries(entries));
      setBodyAdvancedDirty(false);
    }
    if (mode === "json") setBodyAdvancedDirty(false);
    setBodyMode(mode);
    setError("");
  };
  const discover = async () => {
    if (
      !window.confirm(
        "A descoberta fará uma chamada real para a API informada. Selecione POST, PUT ou DELETE somente se essa chamada puder produzir efeitos. Continuar?",
      )
    )
      return;
    if (duplicateHeaderName(headerEntries)) {
      setError("Cada nome de header deve ser único.");
      return;
    }
    const parsedHeaders = headersFromEntries(headerEntries);
    setBusy(true);
    setError("");
    try {
      setFields(
        await connectorsApi.discover({
          url,
          httpMethod: method,
          headers: parsedHeaders,
          ...(body ? { body } : {}),
        }),
      );
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (duplicateHeaderName(headerEntries)) {
      setError("Cada nome de header deve ser único.");
      return;
    }
    const parsedHeaders = headersFromEntries(headerEntries);
    const bodyTemplate = bodyMode === "visual" ? serializeBodyEntries(bodyEntries) : body;
    if (bodyMode === "visual" && bodyEntries.some((entry) => entry.mode === "raw" && entry.value.trim() && !entry.value.includes("#{") && !isJsonValue(entry.value))) {
      setError("Revise os valores JSON/SpEL do body antes de salvar.");
      return;
    }
    setBusy(true);
    setError("");
    await onSave({
      tenantId,
      name,
      baseUrl: url,
      httpMethod: method,
      headersTemplate: parsedHeaders,
      bodyTemplate: bodyTemplate || null,
      extractedFields: fields,
    });
    setBusy(false);
  };
  return (
    <Modal
      title={editing ? "Editar conector" : "Novo conector"}
      description="Configure a chamada e os campos capturados da resposta."
      onClose={onClose}
      wide
    >
      <form onSubmit={(event) => void submit(event)}>
        <div className="modal-body">
          <div className="form-grid">
            <Field label="Nome do conector">
              <input
                required
                maxLength={100}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Ex.: Consulta de cliente"
              />
            </Field>
            <Field label="Tenant ID">
              <input
                required
                value={tenantId}
                onChange={(event) => setTenantId(event.target.value)}
                placeholder="UUID do tenant"
              />
            </Field>
          </div>
          <Field label="URL base">
            <input
              required
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://api.exemplo.com/recurso"
            />
            <small>
              Templates SpEL são aceitos, como #{"#{#inputs['id']}"}.
            </small>
          </Field>
          <Field label="Método HTTP">
            <select
              value={method}
              onChange={(event) => setMethod(event.target.value as HttpMethod)}
            >
              {methods.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </Field>
          <div className="form-field template-field" role="group" aria-label="Headers template">
            <div className="template-editor-heading">
              <div><b>Headers template</b><small>Adicione apenas headers específicos. Valores aceitam SpEL.</small></div>
              <button type="button" className="button button-outline button-small" onClick={() => setHeaderEntries((entries) => [...entries, { id: crypto.randomUUID(), name: "", value: "" }])}><Plus size={13} /> Adicionar header</button>
            </div>
            {headerEntries.length ? <div className="template-entries">{headerEntries.map((entry, index) => <div className="template-entry header-entry" key={entry.id}><span className="template-index">{String(index + 1).padStart(2, "0")}</span><input aria-label={`Nome do header ${index + 1}`} value={entry.name} onChange={(event) => setHeaderEntries((entries) => entries.map((item) => item.id === entry.id ? { ...item, name: event.target.value } : item))} placeholder="Authorization" /><input aria-label={`Valor do header ${index + 1}`} value={entry.value} onChange={(event) => setHeaderEntries((entries) => entries.map((item) => item.id === entry.id ? { ...item, value: event.target.value } : item))} placeholder="Bearer #{#inputs['token']}" /><button type="button" className="row-icon danger" aria-label={`Remover header ${index + 1}`} onClick={() => setHeaderEntries((entries) => entries.filter((item) => item.id !== entry.id))}><Trash2 size={14} /></button></div>)}</div> : <div className="template-empty">Nenhum header adicional</div>}
          </div>
          <div className="form-field template-field" role="group" aria-label="Body template">
            <div className="template-editor-heading">
              <div><b>Body template</b><small>Monte um objeto JSON e use valores dinâmicos de <code>#inputs</code>.</small></div>
              <div className="template-modes" role="tablist" aria-label="Modo de edição do body"><button type="button" role="tab" aria-selected={bodyMode === "visual"} className={bodyMode === "visual" ? "is-active" : ""} onClick={() => changeBodyMode("visual")}>Visual</button><button type="button" role="tab" aria-selected={bodyMode === "json"} className={bodyMode === "json" ? "is-active" : ""} onClick={() => changeBodyMode("json")}>JSON avançado</button></div>
            </div>
            {bodyMode === "visual" ? <><div className="template-entries">{bodyEntries.map((entry, index) => <div className="template-entry body-entry" key={entry.id}><span className="template-index">{String(index + 1).padStart(2, "0")}</span><input aria-label={`Chave do body ${index + 1}`} value={entry.key} onChange={(event) => updateBodyEntries(bodyEntries.map((item) => item.id === entry.id ? { ...item, key: event.target.value } : item))} placeholder="campo" /><select aria-label={`Tipo do valor ${index + 1}`} value={entry.mode} onChange={(event) => updateBodyEntries(bodyEntries.map((item) => item.id === entry.id ? { ...item, mode: event.target.value as BodyEntry["mode"] } : item))}><option value="text">Texto</option><option value="raw">JSON / SpEL</option></select><input aria-label={`Valor do body ${index + 1}`} value={entry.value} onChange={(event) => updateBodyEntries(bodyEntries.map((item) => item.id === entry.id ? { ...item, value: event.target.value } : item))} placeholder={entry.mode === "text" ? "#{#inputs['campo']}" : "#{#inputs['valor']} ou 10"} /><button type="button" className="row-icon danger" aria-label={`Remover campo do body ${index + 1}`} onClick={() => updateBodyEntries(bodyEntries.filter((item) => item.id !== entry.id))}><Trash2 size={14} /></button></div>)}</div><button type="button" className="button button-outline button-small template-add" onClick={() => updateBodyEntries([...bodyEntries, { id: crypto.randomUUID(), key: "", value: "", mode: "text" }])}><Plus size={13} /> Adicionar campo ao body</button><small className="template-help">Texto é enviado entre aspas. JSON / SpEL é inserido como valor JSON ou expressão sem aspas.</small></> : <textarea className="code-input template-json" value={body} onChange={(event) => { setBody(event.target.value); setBodyAdvancedDirty(true) }} placeholder={'{"cliente": "#{#inputs[\'id\']}"}'} spellCheck={false} />}
          </div>
          <section className="fields-editor">
            <div className="fields-heading">
              <div>
                <b>Campos extraídos</b>
                <small>
                  Mapeie os valores da resposta para uso nos próximos passos.
                </small>
              </div>
              <button
                type="button"
                className="button button-outline button-small"
                onClick={() =>
                  setFields((items) => [
                    ...items,
                    { alias: "", path: "", type: "STRING" },
                  ])
                }
              >
                <Plus size={13} /> Adicionar campo
              </button>
            </div>
            {fields.length ? (
              <>
                <div className="field-head">
                  <span>Alias</span>
                  <span>JsonPath</span>
                  <span>Tipo</span>
                  <span />
                </div>
                {fields.map((item, index) => (
                  <div className="field-row" key={`${index}-${item.path}`}>
                    <input
                      aria-label="Alias"
                      value={item.alias}
                      placeholder="nome_campo"
                      onChange={(event) =>
                        setFields((items) =>
                          items.map((field, position) =>
                            position === index
                              ? { ...field, alias: event.target.value }
                              : field,
                          ),
                        )
                      }
                    />
                    <input
                      aria-label="JsonPath"
                      value={item.path}
                      placeholder="data.valor"
                      onChange={(event) =>
                        setFields((items) =>
                          items.map((field, position) =>
                            position === index
                              ? { ...field, path: event.target.value }
                              : field,
                          ),
                        )
                      }
                    />
                    <select
                      aria-label="Tipo"
                      value={item.type}
                      onChange={(event) =>
                        setFields((items) =>
                          items.map((field, position) =>
                            position === index
                              ? {
                                  ...field,
                                  type: event.target.value as FieldType,
                                }
                              : field,
                          ),
                        )
                      }
                    >
                      {fieldTypes.map((type) => (
                        <option key={type}>{type}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="row-icon danger"
                      aria-label="Remover campo"
                      onClick={() =>
                        setFields((items) =>
                          items.filter((_, position) => position !== index),
                        )
                      }
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </>
            ) : (
              <div className="no-fields">
                Nenhum campo mapeado. Adicione manualmente ou descubra pela
                resposta real.
              </div>
            )}
            <div className="discover-row">
              <span>
                <AlertCircle size={14} /> A descoberta executa a chamada real da
                API externa.
              </span>
              <button
                type="button"
                className="button button-outline button-small"
                onClick={() => void discover()}
                disabled={busy}
              >
                {busy ? (
                  <LoaderCircle size={14} className="spin" />
                ) : (
                  <Sparkles size={14} />
                )}{" "}
                Testar e descobrir
              </button>
            </div>
          </section>
          {error && (
            <p className="form-error">
              <AlertCircle size={14} />
              {error}
            </p>
          )}
        </div>
        <footer className="modal-footer">
          <button
            type="button"
            className="button button-quiet"
            onClick={onClose}
          >
            Cancelar
          </button>
          <button className="button button-primary" disabled={busy}>
            {busy ? (
              <LoaderCircle size={15} className="spin" />
            ) : (
              <Check size={15} />
            )}
            {busy ? "Salvando..." : "Salvar conector"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

function WorkflowDialog({
  draft,
  connectors,
  onClose,
  onSave,
}: {
  draft: Exclude<Draft<WorkflowDefinition>, null>;
  connectors: ApiDefinition[];
  onClose: () => void;
  onSave: (input: WorkflowInput) => Promise<void>;
}) {
  const editing = draft !== "new";
  const [name, setName] = useState(editing ? draft.name : "");
  const [tenantId, setTenantId] = useState(editing ? draft.tenantId : "");
  const [active, setActive] = useState(editing ? draft.active : true);
  const [firstStepId, setFirstStepId] = useState(
    editing ? draft.firstStepId : "step_consulta",
  );
  const [connectorId, setConnectorId] = useState(connectors[0]?.id || "");
  const [stepsText, setStepsText] = useState(
    editing
      ? JSON.stringify(draft.steps, null, 2)
      : connectors[0]
        ? starterSteps(connectors[0].id)
        : "{}",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const cycleWarning = useMemo(() => {
    try {
      return containsCycle(JSON.parse(stepsText) as WorkflowInput["steps"]);
    } catch {
      return false;
    }
  }, [stepsText]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    let steps: WorkflowInput["steps"];
    try {
      steps = JSON.parse(stepsText) as WorkflowInput["steps"];
    } catch {
      setError("A definição dos passos precisa ser um JSON válido.");
      return;
    }
    if (!Object.keys(steps).length) {
      setError("O workflow precisa ter ao menos um passo.");
      return;
    }
    if (!steps[firstStepId]) {
      setError(
        "O primeiro passo precisa corresponder a uma chave existente em steps.",
      );
      return;
    }
    if (Object.entries(steps).some(([id, step]) => id !== step.id)) {
      setError("Cada chave de steps precisa ser igual ao id correspondente.");
      return;
    }
    const hasMissingTarget = Object.values(steps).some((step) => {
      const targets =
        step.type === "API_CALL"
          ? [step.nextStepId, step.onErrorStepId]
          : [step.onPassStepId, step.onFailStepId];
      return targets.some((target) => target !== null && !steps[target]);
    });
    if (hasMissingTarget) {
      setError(
        "Cada referência de próximo passo precisa existir na definição steps.",
      );
      return;
    }
    setBusy(true);
    await onSave({ tenantId, name, active, firstStepId, steps });
    setBusy(false);
  };
  return (
    <Modal
      title={editing ? "Editar fluxo" : "Criar fluxo"}
      description="Defina a identificação e os passos que o engine vai executar."
      onClose={onClose}
      wide
    >
      <form onSubmit={(event) => void submit(event)}>
        <div className="modal-body">
          <div className="form-grid">
            <Field label="Nome do fluxo">
              <input
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Ex.: Onboarding de cliente"
              />
            </Field>
            <Field label="Tenant ID">
              <input
                required
                value={tenantId}
                onChange={(event) => setTenantId(event.target.value)}
                placeholder="UUID do tenant"
              />
            </Field>
          </div>
          <div className="form-grid">
            <Field label="ID do primeiro passo">
              <input
                required
                value={firstStepId}
                onChange={(event) => setFirstStepId(event.target.value)}
              />
            </Field>
            <label className="active-toggle">
              <input
                type="checkbox"
                checked={active}
                onChange={(event) => setActive(event.target.checked)}
              />
              <span>
                <b>Fluxo ativo</b>
                <small>Fluxos inativos não podem ser executados.</small>
              </span>
            </label>
          </div>
          {!editing && (
            <Field label="Conector de partida">
              <select
                value={connectorId}
                onChange={(event) => {
                  setConnectorId(event.target.value);
                  if (event.target.value)
                    setStepsText(starterSteps(event.target.value));
                }}
              >
                <option value="">Selecione um conector</option>
                {connectors.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {item.httpMethod}
                  </option>
                ))}
              </select>
              {!connectors.length && (
                <small>
                  Cadastre um conector primeiro ou edite os passos manualmente.
                </small>
              )}
            </Field>
          )}
          <div className="form-field" role="group" aria-label="Editor visual do fluxo">
            <span>Editor visual do fluxo</span>
            <WorkflowGraphEditor
              key={connectorId}
              value={stepsText}
              onChange={setStepsText}
              firstStepId={firstStepId}
              onFirstStepChange={setFirstStepId}
              connectors={connectors}
            />
          </div>
          {cycleWarning && (
            <p className="editor-warning">
              <AlertCircle size={14} /> Este grafo contém um ciclo. A execução
              será limitada a 100 passos pelo engine.
            </p>
          )}
          {error && (
            <p className="form-error">
              <AlertCircle size={14} />
              {error}
            </p>
          )}
        </div>
        <footer className="modal-footer">
          <button
            type="button"
            className="button button-quiet"
            onClick={onClose}
          >
            Cancelar
          </button>
          <button className="button button-primary" disabled={busy}>
            {busy ? (
              <LoaderCircle size={15} className="spin" />
            ) : (
              <Check size={15} />
            )}
            {busy ? "Salvando..." : "Salvar fluxo"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

function RunDialog({ workflow, onClose, onRun }: { workflow: WorkflowDefinition; onClose: () => void; onRun: (workflow: WorkflowDefinition, payload: Record<string, unknown>) => Promise<WorkflowExecutionLog> }) {
  const [text, setText] = useState(() => JSON.stringify(triggerPayloadTemplate(workflow), null, 2))
  const [result, setResult] = useState<WorkflowExecutionLog | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const endpoint = `${window.location.origin}/java/engine-bolt-mesh/api/v1/workflows/${encodeURIComponent(workflow.id)}/trigger`
  const curlExample = [
    'curl --request POST',
    `--url ${shellQuote(endpoint)}`,
    `--header ${shellQuote('Content-Type: application/json')}`,
    `--data ${shellQuote(text)}`,
  ].join(' \\\n  ')
  const copyCurl = async () => {
    try {
      await navigator.clipboard.writeText(curlExample)
      setCopied(true)
      setError('')
    } catch {
      setError('Não foi possível copiar o cURL para a área de transferência.')
    }
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    let payload: Record<string, unknown>
    try { payload = JSON.parse(text) as Record<string, unknown>; if (!payload || Array.isArray(payload) || typeof payload !== 'object') throw new Error('O payload precisa ser um objeto JSON.') } catch (reason) { setError(errorMessage(reason)); return }
    setBusy(true); setError('')
    try { setResult(await onRun(workflow, payload)) } catch (reason) { setError(errorMessage(reason)) } finally { setBusy(false) }
  }
  return <Modal title={result ? 'Resultado da execução' : 'Executar fluxo'} description={result ? workflow.name : `Dispare “${workflow.name}” com um payload de entrada.`} onClose={onClose} wide><form onSubmit={(event) => void submit(event)}><div className="modal-body">{result ? <ExecutionResult result={result} /> : <><div className="run-target"><span><Zap size={16} /></span><div><b>{workflow.name}</b><small>{Object.keys(workflow.steps).length} etapas · versão {workflow.version}</small></div><span className={`state-pill ${workflow.active ? 'active' : 'inactive'}`}><i />{workflow.active ? 'Ativo' : 'Inativo'}</span></div><Field label="Payload de entrada"><textarea className="code-input payload-code" value={text} onChange={(event) => { setText(event.target.value); setCopied(false) }} spellCheck={false} /></Field><small className="input-hint">O objeto JSON fica disponível nas expressões SpEL em <code>#trigger</code>.</small><section className="curl-panel"><div className="curl-panel-heading"><div><b>Endpoint e exemplo cURL</b><code className="curl-endpoint">{endpoint}</code></div><button type="button" className="curl-copy" onClick={() => void copyCurl()} aria-label={copied ? 'cURL copiado' : 'Copiar cURL'} title={copied ? 'Copiado' : 'Copiar cURL'}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? 'Copiado' : 'Copiar'}</button></div><pre className="curl-command"><code>{curlExample}</code></pre></section></>}{error && <p className="form-error"><AlertCircle size={14} />{error}</p>}</div><footer className="modal-footer"><button type="button" className="button button-quiet" onClick={onClose}>{result ? 'Fechar' : 'Cancelar'}</button>{!result && <button className="button button-primary" disabled={busy || !workflow.active}>{busy ? <LoaderCircle size={15} className="spin" /> : <Zap size={15} />}{busy ? 'Executando...' : 'Executar agora'}</button>}{!workflow.active && !result && <span className="run-disabled">Ative o fluxo para executar.</span>}</footer></form></Modal>
}
function ExecutionResult({ result }: { result: WorkflowExecutionLog }) {
  return <div className="execution-result"><div className={`execution-banner ${result.status === 'COMPLETED' ? 'complete' : 'failed'}`}><span>{result.status === 'COMPLETED' ? <CheckCircle2 size={19} /> : <AlertCircle size={19} />}</span><div><b>{result.status === 'COMPLETED' ? 'Fluxo concluído' : 'Execução com falha'}</b><small>{new Date(result.startedAt).toLocaleString('pt-BR')} · {result.stepTraces.reduce((sum, trace) => sum + trace.durationMs, 0)} ms</small></div><code>{result.id.slice(0, 8)}</code></div><div className="timeline-heading"><b>Etapas executadas</b><small>{result.stepTraces.length} etapas</small></div>{result.stepTraces.map((trace, index) => <div className="timeline-row" key={`${trace.stepId}-${index}`}><span className={`timeline-marker ${trace.status === 'SUCCESS' ? 'marker-ok' : trace.status === 'FAILED_RULES' ? 'marker-warn' : 'marker-fail'}`}>{trace.status === 'SUCCESS' ? <Check size={12} /> : trace.status === 'FAILED_RULES' ? <GitBranch size={12} /> : <X size={12} />}</span><div><b>{trace.stepId === '-' ? 'Erro do engine' : trace.stepId}</b><small>{trace.stepType} · {trace.status === 'FAILED_RULES' ? 'Regras reprovadas' : trace.status === 'SUCCESS' ? 'Concluído' : 'Falha'}</small><pre>{typeof trace.details === 'string' ? trace.details : JSON.stringify(trace.details, null, 2)}</pre></div><small>{trace.durationMs} ms</small></div>)}</div>
}
function ConfirmDialog({ target, onClose, onConfirm }: { target: { kind: 'connector' | 'workflow'; id: string }; onClose: () => void; onConfirm: () => void }) {
  const connector = target.kind === 'connector'
  return <Modal title={`Excluir ${connector ? 'conector' : 'fluxo'}?`} description="Esta ação não pode ser desfeita." onClose={onClose}><div className="modal-body confirm-warning"><AlertCircle size={18} /><span>{connector ? 'Fluxos que usam este conector poderão falhar ao executar. O backend não bloqueia a exclusão.' : 'O fluxo será removido permanentemente do workspace.'}</span></div><footer className="modal-footer"><button className="button button-quiet" onClick={onClose}>Cancelar</button><button className="button button-danger" onClick={onConfirm}><Trash2 size={14} /> Excluir</button></footer></Modal>
}
