export type Uuid = string
export type FieldType = 'STRING' | 'INTEGER' | 'DECIMAL' | 'BOOLEAN' | 'OBJECT'
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'

export interface ExtractedField {
  alias: string
  path: string
  type: FieldType
}

export interface ApiDefinition {
  id: Uuid
  tenantId: Uuid
  name: string
  baseUrl: string
  httpMethod: HttpMethod
  headersTemplate: Record<string, string> | null
  bodyTemplate: string | null
  extractedFields: ExtractedField[]
  createdAt: string
}

export type ApiDefinitionInput = Omit<ApiDefinition, 'id' | 'createdAt'>

export interface DiscoverRequest {
  url: string
  httpMethod: HttpMethod
  headers?: Record<string, string>
  body?: string
}

export interface RetryPolicy {
  maxAttempts: number
  backoffMillis: number
}

export interface ApiCallStep {
  type: 'API_CALL'
  id: string
  name: string
  apiDefinitionId: Uuid
  inputMappings: Record<string, string>
  retryPolicy?: RetryPolicy | null
  nextStepId: string | null
  onErrorStepId: string | null
}

export interface ValidationRule {
  description: string
  spelExpression: string
  failureMessage: string
}

export interface ValidationRuleStep {
  type: 'VALIDATION_RULE'
  id: string
  name: string
  operator: 'AND' | 'OR'
  rules: ValidationRule[]
  onPassStepId: string | null
  onFailStepId: string | null
}

export type WorkflowStep = ApiCallStep | ValidationRuleStep

export interface WorkflowDefinition {
  id: Uuid
  tenantId: Uuid
  name: string
  active: boolean
  version: number
  firstStepId: string
  steps: Record<string, WorkflowStep>
  createdAt: string
  updatedAt: string
}

export type WorkflowInput = Pick<WorkflowDefinition, 'tenantId' | 'name' | 'firstStepId' | 'steps'> & {
  active?: boolean
}

export interface StepTrace {
  stepId: string
  stepType: 'API_CALL' | 'VALIDATION_RULE' | 'ENGINE'
  status: 'SUCCESS' | 'ERROR' | 'FAILED_RULES'
  details: unknown
  durationMs: number
  timestamp: string
}

export interface WorkflowExecutionLog {
  id: Uuid
  workflowId: Uuid
  status: 'COMPLETED' | 'FAILED'
  triggerPayload: Record<string, unknown>
  finalStepOutputs: Record<string, unknown>
  stepTraces: StepTrace[]
  startedAt: string
  finishedAt: string
}

export interface ProblemDetail {
  type?: string
  title?: string
  status: number
  detail?: string
  instance?: string
}