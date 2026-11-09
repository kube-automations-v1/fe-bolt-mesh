import type {
  ApiDefinition,
  ApiDefinitionInput,
  DiscoverRequest,
  ExtractedField,
  ProblemDetail,
  Uuid,
  WorkflowDefinition,
  WorkflowExecutionLog,
  WorkflowInput,
} from './types'

const BASE = '/java/engine-bolt-mesh/api/v1'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })

  if (!response.ok) {
    const problem = (await response.json().catch(() => ({ status: response.status }))) as ProblemDetail
    throw new Error(problem.detail || problem.title || `Erro ${response.status} ao acessar a API`)
  }

  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export const connectorsApi = {
  list: () => request<ApiDefinition[]>('/connectors'),
  create: (body: ApiDefinitionInput) =>
    request<ApiDefinition>('/connectors', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: Uuid, body: ApiDefinitionInput) =>
    request<ApiDefinition>(`/connectors/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  remove: (id: Uuid) => request<void>(`/connectors/${id}`, { method: 'DELETE' }),
  discover: (body: DiscoverRequest) =>
    request<ExtractedField[]>('/connectors/discover', { method: 'POST', body: JSON.stringify(body) }),
}

export const workflowsApi = {
  list: () => request<WorkflowDefinition[]>('/workflows'),
  create: (body: WorkflowInput) =>
    request<WorkflowDefinition>('/workflows', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: Uuid, body: WorkflowInput) =>
    request<WorkflowDefinition>(`/workflows/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  remove: (id: Uuid) => request<void>(`/workflows/${id}`, { method: 'DELETE' }),
  trigger: (id: Uuid, payload: Record<string, unknown>) =>
    request<WorkflowExecutionLog>(`/workflows/${id}/trigger`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
}