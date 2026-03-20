import type { MigrationJob, FailedRow, User, ExportRecord } from '../types'

export const mockUser: User = {
  id: 'user_01',
  name: 'Parth Sharma',
  email: 'parth@shopify-store.io',
  avatarInitials: 'PS',
}

export const mockJobs: MigrationJob[] = [
  {
    id: 'job_01',
    name: 'Black Friday Customer Import',
    type: 'customer',
    status: 'completed',
    inputFormat: 'csv',
    totalRows: 10,
    correctRows: 8,
    failedRows: 2,
    processedRows: 10,
    processingRows: 0,
    progress: 100,
    createdAt: '2026-03-15T09:00:00Z',
    updatedAt: '2026-03-15T09:47:12Z',
    completedAt: '2026-03-15T09:47:12Z',
  },
  {
    id: 'job_02',
    name: 'Spring Collection Products',
    type: 'product',
    status: 'processing',
    inputFormat: 'json',
    totalRows: 200,
    correctRows: 108,
    failedRows: 22,
    processedRows: 130,
    processingRows: 70,
    progress: 65,
    createdAt: '2026-03-17T08:10:00Z',
    updatedAt: '2026-03-17T08:51:33Z',
  },
  {
    id: 'job_03',
    name: 'Q1 Order History Sync',
    type: 'order',
    status: 'pending',
    inputFormat: 'xml',
    totalRows: 450,
    correctRows: 0,
    failedRows: 0,
    processedRows: 0,
    processingRows: 0,
    progress: 0,
    createdAt: '2026-03-17T10:30:00Z',
    updatedAt: '2026-03-17T10:30:00Z',
  },
]

export const mockFailedRows: FailedRow[] = [
  {
    id: 'row_01',
    jobId: 'job_01',
    rowIndex: 4,
    originalData: {
      first_name: 'Jordan',
      last_name: 'McAllister',
      email: 'jordan.mcallister@@gmail.com',
      phone: '+1-555-0192',
      accepts_marketing: 'yes',
      tags: 'vip, wholesale',
    },
    errorMessage:
      'Invalid email address format: double "@" symbol detected at position 18.',
    confidenceScore: 0.12,
    attempts: 2,
    status: 'failed',
    validationErrors: [],
  },
  {
    id: 'row_02',
    jobId: 'job_01',
    rowIndex: 9,
    originalData: {
      first_name: 'Amara',
      last_name: '',
      email: 'amara.okonkwo@example.com',
      phone: '',
      accepts_marketing: 'true',
      tags: 'retail',
    },
    errorMessage:
      'Required field "last_name" is empty. Shopify requires a non-empty last name for customer records.',
    confidenceScore: 0.45,
    attempts: 1,
    status: 'failed',
    validationErrors: [],
  },
  {
    id: 'row_03',
    jobId: 'job_02',
    rowIndex: 17,
    originalData: {
      title: 'Linen Blend Oversized Shirt',
      vendor: 'Studio North',
      product_type: 'Apparel',
      price: '-29.99',
      compare_at_price: '59.99',
      sku: 'SN-SHIRT-001',
      inventory_quantity: 'forty',
      status: 'active',
    },
    errorMessage:
      'Field "price" must be a positive number. Received: "-29.99". Field "inventory_quantity" must be an integer. Received: "forty".',
    confidenceScore: 0.67,
    attempts: 3,
    status: 'failed',
    validationErrors: [],
  },
  {
    id: 'row_04',
    jobId: 'job_02',
    rowIndex: 31,
    originalData: {
      title: '',
      vendor: 'Bloom & Co.',
      product_type: 'Home Decor',
      price: '124.00',
      compare_at_price: '100.00',
      sku: 'BC-VASE-002',
      inventory_quantity: 15,
      status: 'draft',
    },
    errorMessage:
      'Product title is required and cannot be blank. Additionally, "compare_at_price" (100.00) must be greater than "price" (124.00) if set.',
    confidenceScore: 0.31,
    attempts: 1,
    status: 'failed',
    validationErrors: [],
  },
]

export const mockExportRecords: ExportRecord[] = [
  {
    type: 'correct',
    count: 8,
    sizeKb: 14.2,
    filename: 'black_friday_customers_correct.json',
  },
  {
    type: 'failed',
    count: 2,
    sizeKb: 3.8,
    filename: 'black_friday_customers_failed.json',
  },
  {
    type: 'all',
    count: 10,
    sizeKb: 18.1,
    filename: 'black_friday_customers_all.json',
  },
]

export const getJobById = (id: string): MigrationJob | undefined =>
  mockJobs.find((j) => j.id === id)

export const getFailedRowsByJobId = (jobId: string): FailedRow[] =>
  mockFailedRows.filter((r) => r.jobId === jobId)
