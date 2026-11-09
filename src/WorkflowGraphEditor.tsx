import { useMemo, useState, type MouseEvent } from 'react'
import { Background, Controls, Handle, MarkerType, MiniMap, Position, ReactFlow, applyEdgeChanges, applyNodeChanges, type Connection, type Edge, type EdgeChange, type Node, type NodeChange, type NodeProps, type OnConnect } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Activity, AlertCircle, ArrowDown, ArrowRight, Check, CircleHelp, GitBranch, Plus, Trash2, Waypoints, X } from 'lucide-react'
import type { ApiDefinition, ValidationRule, ValidationRuleStep, WorkflowInput, WorkflowStep } from './types'

type BlockData = { step: WorkflowStep; connectorName: string; first: boolean }
type BlockNode = Node<BlockData, 'workflowBlock'>
type FlowEdge = Edge

type GraphEditorProps = {
  value: string
  onChange: (value: string) => void
  firstStepId: string
  onFirstStepChange: (id: string) => void
  connectors: ApiDefinition[]
}

function parseSteps(value: string): WorkflowInput['steps'] {
  try {
    const parsed: unknown = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as WorkflowInput['steps']
      : {}
  } catch {
    return {}
  }
}

function branchTargets(step: WorkflowStep) {
  return step.type === 'API_CALL'
    ? [{ handle: 'next', label: 'Próximo' }, { handle: 'error', label: 'Em caso de erro' }]
    : [{ handle: 'pass', label: 'Se aprovado' }, { handle: 'fail', label: 'Se reprovado' }]
}

function branchTarget(step: WorkflowStep, handle: string) {
  if (step.type === 'API_CALL') {
    if (handle === 'next') return step.nextStepId
    if (handle === 'error') return step.onErrorStepId
  } else {
    if (handle === 'pass') return step.onPassStepId
    if (handle === 'fail') return step.onFailStepId
  }
  return null
}

function flowEdges(steps: WorkflowInput['steps']): FlowEdge[] {
  return Object.values(steps).flatMap((step) => branchTargets(step).flatMap(({ handle, label }) => {
    const target = branchTarget(step, handle)
    if (!target || !steps[target]) return []
    return [{
      id: `${step.id}:${handle}:${target}`,
      source: step.id,
      sourceHandle: handle,
      target,
      targetHandle: 'input',
      label,
      markerEnd: { type: MarkerType.ArrowClosed, color: '#b04a94' },
      style: { stroke: '#b04a94', strokeWidth: 1.8 },
      labelStyle: { fill: '#776b7b', fontSize: 10, fontWeight: 600 },
      labelBgStyle: { fill: '#fff', fillOpacity: 0.95 },
    }]
  }))
}

function branchUpdate(steps: WorkflowInput['steps'], sourceId: string, handle: string, targetId: string | null) {
  const step = steps[sourceId]
  if (!step) return steps
  if (step.type === 'API_CALL') {
    if (handle === 'next') return { ...steps, [sourceId]: { ...step, nextStepId: targetId } }
    if (handle === 'error') return { ...steps, [sourceId]: { ...step, onErrorStepId: targetId } }
  } else {
    if (handle === 'pass') return { ...steps, [sourceId]: { ...step, onPassStepId: targetId } }
    if (handle === 'fail') return { ...steps, [sourceId]: { ...step, onFailStepId: targetId } }
  }
  return steps
}

function nodePositions(steps: WorkflowInput['steps'], firstStepId: string) {
  const depths = new Map<string, number>()
  const queue: Array<{ id: string; depth: number }> = firstStepId ? [{ id: firstStepId, depth: 0 }] : []
  while (queue.length) {
    const current = queue.shift()!
    if (depths.has(current.id) || !steps[current.id]) continue
    depths.set(current.id, current.depth)
    const step = steps[current.id]
    for (const { handle } of branchTargets(step)) {
      const target = branchTarget(step, handle)
      if (target && steps[target] && !depths.has(target)) queue.push({ id: target, depth: current.depth + 1 })
    }
  }
  const depthMap = new Map<number, string[]>()
  for (const id of Object.keys(steps)) {
    const depth = depths.get(id) ?? 0
    const group = depthMap.get(depth) ?? []
    group.push(id)
    depthMap.set(depth, group)
  }
  return new Map([...depthMap].flatMap(([depth, ids]) => ids.map((id, index) => [id, { x: 54 + depth * 330, y: 44 + index * 205 }] as const)))
}

function makeNodes(steps: WorkflowInput['steps'], firstStepId: string, connectors: ApiDefinition[]): BlockNode[] {
  const positions = nodePositions(steps, firstStepId)
  return Object.values(steps).map((step) => ({
    id: step.id,
    type: 'workflowBlock',
    position: positions.get(step.id) ?? { x: 54, y: 44 },
    data: {
      step,
      connectorName: step.type === 'API_CALL' ? connectors.find((item) => item.id === step.apiDefinitionId)?.name ?? 'Conector não encontrado' : '',
      first: step.id === firstStepId,
    },
  }))
}

function WorkflowBlock({ data, selected }: NodeProps<BlockNode>) {
  const step = data.step
  const isApi = step.type === 'API_CALL'
  const details = step.type === 'API_CALL'
    ? <><span className="block-method">{data.connectorName}</span><small>{Object.keys(step.inputMappings).length} entradas</small></>
    : <><span className="block-method">Todas {step.operator === 'AND' ? 'as regras' : 'as opções'}</span><small>{step.rules.length} regras</small></>
  return <article className={`workflow-block ${isApi ? 'block-api' : 'block-rule'} ${selected ? 'block-selected' : ''}`}>
    <Handle type="target" position={Position.Top} id="input" className="block-handle handle-target" />
    <div className="block-topline"><span className="block-kind">{isApi ? <Activity size={13} /> : <GitBranch size={13} />}{isApi ? 'AÇÃO' : 'CONDIÇÃO'}</span>{data.first && <span className="trigger-tag">INÍCIO</span>}</div>
    <strong className="block-title">{step.name || (isApi ? 'Chamar API' : 'Validar regras')}</strong>
    <div className="block-detail">{details}</div>
    <div className="block-footer">{isApi ? <><span className="branch-label branch-next">Próximo</span><span className="branch-label branch-error">Erro</span></> : <><span className="branch-label branch-next">Aprovado</span><span className="branch-label branch-error">Reprovado</span></>}</div>
    <Handle type="source" position={Position.Bottom} id={isApi ? 'next' : 'pass'} className="block-handle handle-success" />
    <Handle type="source" position={Position.Right} id={isApi ? 'error' : 'fail'} className="block-handle handle-error" />
  </article>
}

const nodeTypes = { workflowBlock: WorkflowBlock }

export default function WorkflowGraphEditor({ value, onChange, firstStepId, onFirstStepChange, connectors }: GraphEditorProps) {
  const [steps, setSteps] = useState<WorkflowInput['steps']>(() => parseSteps(value))
  const [nodes, setNodes] = useState<BlockNode[]>(() => makeNodes(steps, firstStepId, connectors))
  const [edges, setEdges] = useState<FlowEdge[]>(() => flowEdges(steps))
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const updateSteps = (updated: WorkflowInput['steps']) => {
    setSteps(updated)
    onChange(JSON.stringify(updated, null, 2))
  }

  const selectedStep = selectedNodeId ? steps[selectedNodeId] : undefined
  const onNodesChange = (changes: NodeChange<BlockNode>[]) => setNodes((current) => applyNodeChanges(changes, current) as BlockNode[])
  const onConnect: OnConnect = (connection: Connection) => {
    if (!connection.source || !connection.target || !connection.sourceHandle || connection.source === connection.target) return
    const updated = branchUpdate(steps, connection.source, connection.sourceHandle, connection.target)
    updateSteps(updated)
    setEdges(flowEdges(updated))
    setSelectedEdgeId(null)
  }
  const onEdgesChange = (changes: EdgeChange<FlowEdge>[]) => {
    const removed = changes.filter((change) => change.type === 'remove')
    if (removed.length) {
      let updated = steps
      for (const change of removed) {
        const edge = edges.find((item) => item.id === change.id)
        if (edge?.sourceHandle) updated = branchUpdate(updated, edge.source, edge.sourceHandle, null)
      }
      if (updated !== steps) updateSteps(updated)
      setEdges(flowEdges(updated))
      return
    }
    setEdges((current) => applyEdgeChanges(changes, current))
  }

  const updateStep = (id: string, patch: Partial<WorkflowStep>) => {
    const current = steps[id]
    if (!current) return
    const updatedStep = { ...current, ...patch } as WorkflowStep
    const updated = { ...steps, [id]: updatedStep }
    updateSteps(updated)
    setNodes((currentNodes) => currentNodes.map((node) => node.id === id ? {
      ...node,
      data: {
        ...node.data,
        step: updatedStep,
        connectorName: updatedStep.type === 'API_CALL' ? connectors.find((item) => item.id === updatedStep.apiDefinitionId)?.name ?? 'Conector não encontrado' : '',
      },
    } : node))
  }

  const addStep = (type: 'API_CALL' | 'VALIDATION_RULE') => {
    const id = `step_${crypto.randomUUID().slice(0, 8)}`
    const step: WorkflowStep = type === 'API_CALL'
      ? { type, id, name: 'Nova ação', apiDefinitionId: connectors[0]?.id ?? '', inputMappings: {}, retryPolicy: null, nextStepId: null, onErrorStepId: null }
      : { type, id, name: 'Nova condição', operator: 'AND', rules: [], onPassStepId: null, onFailStepId: null }
    const updated = { ...steps, [id]: step }
    const anchor = nodes.find((node) => node.id === selectedNodeId)
    const position = anchor ? { x: anchor.position.x + 330, y: anchor.position.y + 40 } : { x: 54, y: 44 + nodes.length * 205 }
    updateSteps(updated)
    setNodes((current) => [...current, { id, type: 'workflowBlock', position, data: { step, connectorName: type === 'API_CALL' ? connectors[0]?.name ?? 'Conector não encontrado' : '', first: false } }])
    setSelectedNodeId(id)
  }

  const deleteSelectedStep = () => {
    if (!selectedNodeId) return
    const updated = Object.fromEntries(Object.entries(steps).filter(([id]) => id !== selectedNodeId).map(([id, step]) => {
      if (step.type === 'API_CALL') return [id, { ...step, nextStepId: step.nextStepId === selectedNodeId ? null : step.nextStepId, onErrorStepId: step.onErrorStepId === selectedNodeId ? null : step.onErrorStepId }]
      return [id, { ...step, onPassStepId: step.onPassStepId === selectedNodeId ? null : step.onPassStepId, onFailStepId: step.onFailStepId === selectedNodeId ? null : step.onFailStepId }]
    })) as WorkflowInput['steps']
    updateSteps(updated)
    setNodes((current) => current.filter((node) => node.id !== selectedNodeId))
    setEdges(flowEdges(updated))
    if (selectedNodeId === firstStepId) {
      const nextFirstStepId = Object.keys(updated)[0] ?? ''
      onFirstStepChange(nextFirstStepId)
      setNodes((current) => current.map((node) => ({ ...node, data: { ...node.data, first: node.id === nextFirstStepId } })))
    }
    setSelectedNodeId(null)
  }

  const disconnectSelectedEdge = () => {
    const selected = edges.find((edge) => edge.id === selectedEdgeId)
    if (!selected?.sourceHandle) return
    const updated = branchUpdate(steps, selected.source, selected.sourceHandle, null)
    updateSteps(updated)
    setEdges(flowEdges(updated))
    setSelectedEdgeId(null)
  }

  const onNodeClick = (_event: MouseEvent, node: BlockNode) => {
    setSelectedNodeId(node.id)
    setSelectedEdgeId(null)
  }
  const onEdgeClick = (_event: MouseEvent, edge: FlowEdge) => {
    setSelectedEdgeId(edge.id)
    setSelectedNodeId(null)
  }
  const nodeCount = useMemo(() => Object.keys(steps).length, [steps])
  const displayNodes = useMemo(() => nodes.map((node) => ({ ...node, data: { ...node.data, first: node.id === firstStepId } })), [nodes, firstStepId])

  return <section className="workflow-builder">
    <header className="builder-toolbar"><div className="builder-tools"><span className="builder-counter"><Waypoints size={15} />{nodeCount} blocos</span><button className="button button-outline button-small" type="button" disabled={!connectors.length} onClick={() => addStep('API_CALL')}><Plus size={13} /> Ação</button><button className="button button-outline button-small" type="button" onClick={() => addStep('VALIDATION_RULE')}><Plus size={13} /> Condição</button><span className="builder-divider" /><button className="button button-quiet button-small" type="button" disabled={!selectedEdgeId} onClick={disconnectSelectedEdge}><X size={13} /> Desconectar</button><button className="button button-quiet button-small" type="button" disabled={!selectedNodeId} onClick={deleteSelectedStep}><Trash2 size={13} /> Remover bloco</button></div><span className="builder-tip"><CircleHelp size={13} /> Arraste os pontos para encaixar</span></header>
    <div className="builder-layout"><div className="builder-canvas"><ReactFlow nodes={displayNodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onNodeClick={onNodeClick} onEdgeClick={onEdgeClick} onPaneClick={() => { setSelectedNodeId(null); setSelectedEdgeId(null) }} fitView fitViewOptions={{ padding: 0.18 }} minZoom={0.25} maxZoom={1.5} deleteKeyCode={['Backspace', 'Delete']} defaultEdgeOptions={{ markerEnd: { type: MarkerType.ArrowClosed } }}>
      <Background color="#e9e2ec" gap={20} size={1} /><MiniMap pannable zoomable nodeColor={(node) => node.type === 'workflowBlock' ? ((node.data as BlockData).step.type === 'API_CALL' ? '#e4488c' : '#8c43a0') : '#9a8da0'} /><Controls position="bottom-left" />
    </ReactFlow>{!nodeCount && <div className="canvas-empty"><span><Waypoints size={22} /></span><b>Monte seu fluxo visualmente</b><small>Adicione uma ação ou condição para começar a conectar os blocos.</small><button className="button button-primary button-small" type="button" onClick={() => addStep(connectors.length ? 'API_CALL' : 'VALIDATION_RULE')}><Plus size={13} /> Adicionar primeiro bloco</button></div>}</div>
          <aside className="block-inspector">{selectedStep ? <StepInspector key={selectedStep.id} step={selectedStep} connectors={connectors} isFirst={selectedStep.id === firstStepId} onUpdate={(patch) => updateStep(selectedStep.id, patch)} onSetFirst={() => { onFirstStepChange(selectedStep.id); setNodes((current) => current.map((node) => ({ ...node, data: { ...node.data, first: node.id === selectedStep.id } }))) }} /> : <div className="inspector-empty"><span><ArrowRight size={17} /></span><b>Selecione um bloco</b><small>As configurações da ação ou condição aparecem aqui.</small></div>}</aside>
    </div>
  </section>
}

function StepInspector({ step, connectors, isFirst, onUpdate, onSetFirst }: { step: WorkflowStep; connectors: ApiDefinition[]; isFirst: boolean; onUpdate: (patch: Partial<WorkflowStep>) => void; onSetFirst: () => void }) {
  const [mappingText, setMappingText] = useState(step.type === 'API_CALL' ? JSON.stringify(step.inputMappings, null, 2) : '')
  const [rulesText, setRulesText] = useState(step.type === 'VALIDATION_RULE' ? JSON.stringify(step.rules, null, 2) : '')
  const [jsonError, setJsonError] = useState('')
  const saveMappings = () => {
    if (step.type !== 'API_CALL') return
    try { onUpdate({ inputMappings: JSON.parse(mappingText) as Record<string, string> }); setJsonError('') } catch { setJsonError('JSON inválido: os mapeamentos não foram aplicados.') }
  }
  const saveRules = () => {
    if (step.type !== 'VALIDATION_RULE') return
    try { onUpdate({ rules: JSON.parse(rulesText) as ValidationRule[] }); setJsonError('') } catch { setJsonError('JSON inválido: as regras não foram aplicadas.') }
  }
  return <div className="inspector-content"><div className="inspector-kicker">CONFIGURAÇÃO DO BLOCO</div><div className={`inspector-type ${step.type === 'API_CALL' ? 'api' : 'rule'}`}>{step.type === 'API_CALL' ? <Activity size={14} /> : <GitBranch size={14} />}{step.type === 'API_CALL' ? 'Ação' : 'Condição'}</div><label className="inspector-field"><span>Nome do bloco</span><input value={step.name} onChange={(event) => onUpdate({ name: event.target.value })} /></label>{step.type === 'API_CALL' ? <>
    <label className="inspector-field"><span>Conector</span><select value={step.apiDefinitionId} onChange={(event) => onUpdate({ apiDefinitionId: event.target.value })}><option value="">Selecione</option>{connectors.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.httpMethod}</option>)}</select></label>
    <label className="inspector-field"><span>Mapeamentos de entrada <small>JSON</small></span><textarea className="inspector-code" value={mappingText} onChange={(event) => setMappingText(event.target.value)} onBlur={saveMappings} spellCheck={false} /></label>
    <div className="retry-section"><b>Política de repetição</b><div><label><span>Tentativas</span><input type="number" min="1" value={step.retryPolicy?.maxAttempts ?? 1} onChange={(event) => onUpdate({ retryPolicy: { maxAttempts: Number(event.target.value), backoffMillis: step.retryPolicy?.backoffMillis ?? 0 } })} /></label><label><span>Espera (ms)</span><input type="number" min="0" value={step.retryPolicy?.backoffMillis ?? 0} onChange={(event) => onUpdate({ retryPolicy: { maxAttempts: step.retryPolicy?.maxAttempts ?? 1, backoffMillis: Number(event.target.value) } })} /></label></div></div>
  </> : <>
    <label className="inspector-field"><span>Operador</span><select value={step.operator} onChange={(event) => onUpdate({ operator: event.target.value as ValidationRuleStep['operator'] })}><option value="AND">Todas as regras (AND)</option><option value="OR">Qualquer regra (OR)</option></select></label>
    <label className="inspector-field"><span>Regras <small>JSON</small></span><textarea className="inspector-code rules-code" value={rulesText} onChange={(event) => setRulesText(event.target.value)} onBlur={saveRules} spellCheck={false} /></label>
  </>}{jsonError && <p className="inspector-error"><AlertCircle size={12} />{jsonError}</p>}<button type="button" className={`first-step-button ${isFirst ? 'is-first' : ''}`} onClick={onSetFirst}>{isFirst ? <Check size={14} /> : <ArrowDown size={14} />}{isFirst ? 'Bloco inicial' : 'Definir como inicial'}</button><div className="inspector-note"><span>Saídas</span>{branchTargets(step).map(({ handle, label }) => <small key={handle}><i className={`port-dot ${handle}`} />{label}</small>)}</div></div>
}
