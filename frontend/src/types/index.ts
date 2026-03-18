export type MigrationStatus = 'pending' | 'processing' | 'completed' | 'failed'

export type MigrationType = 'product' | 'customer' | 'order'

export type InputFormat =
  | 'json'
  | 'csv'
  | 'xml'
  | 'text'
  | 'raw_text'
  | 'ai_parser'
  | 'website_url'
  | 'google_sheet'

export interface MigrationJob {
  id: string
  name: string
  type: MigrationType
  status: MigrationStatus
  inputFormat: InputFormat
  totalRows: number
  processedRows: number
  correctRows: number
  failedRows: number
  processingRows: number
  progress: number // 0-100
  createdAt: string
  updatedAt: string
  completedAt?: string
}

export interface FailedRow {
  id: string
  jobId: string
  rowIndex: number
  originalData: Record<string, unknown>
  errorMessage: string
  confidenceScore: number // 0-1
  attempts: number
  status: 'failed' | 'retrying' | 'resolved'
}

export interface ExportRecord {
  type: 'correct' | 'failed' | 'all'
  count: number
  sizeKb: number
  filename: string
}

export interface User {
  id: string
  name: string
  email: string
  avatarInitials: string
}

export type CrawlSessionStatus = 'idle' | 'crawling' | 'stopping' | 'paused' | 'completed' | 'error'

export interface StoredCrawlSession {
  url: string
  startedAt: string
  status: CrawlSessionStatus
  pagesVisited: number
  productsScraped: number
  elapsedSeconds: number
  jobId?: string | null
}

export interface NewMigrationForm {
  jobName: string
  migrationType: MigrationType
  inputFormat: InputFormat
  rawData: string
  file: File | null
}
