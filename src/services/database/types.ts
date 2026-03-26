// ─── Schema / Migrations ──────────────────────────────────────────────────────

export interface StoreSchema {
  name: string;
  keyPath: string;
  indexes: { name: string; keyPath: string; unique?: boolean }[];
  autoIncrement?: boolean;
}

export interface Migration {
  version: number;
  description: string;
  appliedAt?: number;
  status: 'pending' | 'applied' | 'failed' | 'rolled_back';
  up: string;   // human-readable description of the upgrade
  down: string; // human-readable description of the rollback
}

// ─── Backup / Recovery ────────────────────────────────────────────────────────

export type BackupStatus = 'idle' | 'running' | 'completed' | 'failed';

export interface BackupRecord {
  id: string;
  createdAt: number;
  sizeBytes: number;
  stores: string[];
  recordCount: number;
  status: BackupStatus;
  label?: string;
  data?: string; // JSON blob (only kept in memory for download)
}

// ─── Performance ──────────────────────────────────────────────────────────────

export interface StoreStats {
  name: string;
  recordCount: number;
  estimatedSizeBytes: number;
  lastWriteAt?: number;
  indexCount: number;
}

export interface QueryMetric {
  id: string;
  store: string;
  operation: 'read' | 'write' | 'delete' | 'count';
  durationMs: number;
  timestamp: number;
  recordCount?: number;
}

export interface PerformanceReport {
  totalQueries: number;
  avgDurationMs: number;
  p95DurationMs: number;
  slowQueries: QueryMetric[]; // > 100ms
  storeStats: StoreStats[];
  storageUsedMB: number;
  storageQuotaMB: number;
}

// ─── Replication ──────────────────────────────────────────────────────────────

export type ReplicationStatus = 'idle' | 'syncing' | 'error' | 'disabled';

export interface ReplicationConfig {
  enabled: boolean;
  endpoint: string;
  intervalMs: number;
  lastSyncAt?: number;
  status: ReplicationStatus;
  errorMessage?: string;
  syncedRecords: number;
}

// ─── Maintenance ─────────────────────────────────────────────────────────────

export interface MaintenanceTask {
  id: string;
  name: string;
  description: string;
  lastRunAt?: number;
  nextRunAt?: number;
  status: 'idle' | 'running' | 'completed' | 'failed';
  intervalMs: number; // 0 = manual only
  result?: string;
}

// ─── Alerts ───────────────────────────────────────────────────────────────────

export type DbAlertSeverity = 'info' | 'warning' | 'critical';

export interface DbAlert {
  id: string;
  timestamp: number;
  severity: DbAlertSeverity;
  message: string;
  dismissed: boolean;
}

// ─── Overall state ────────────────────────────────────────────────────────────

export interface DatabaseState {
  dbName: string;
  dbVersion: number;
  isOpen: boolean;
  migrations: Migration[];
  backups: BackupRecord[];
  replication: ReplicationConfig;
  maintenanceTasks: MaintenanceTask[];
  alerts: DbAlert[];
  queryMetrics: QueryMetric[];
  lastHealthCheck?: number;
}
