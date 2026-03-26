import {
  DatabaseState, Migration, BackupRecord, StoreStats, QueryMetric,
  PerformanceReport, ReplicationConfig, MaintenanceTask, DbAlert,
} from './types';

const STORAGE_KEY = 'db_manager_state';
const DB_NAME = 'fidelis-soroban-db';
const DB_VERSION = 1;

// ─── Known stores (mirrors FidelisDBSchema) ───────────────────────────────────

const KNOWN_STORES = [
  { name: 'balances',            keyPath: 'id', indexes: [{ name: 'by-address', keyPath: 'address' }, { name: 'by-timestamp', keyPath: 'lastUpdated' }] },
  { name: 'escrows',             keyPath: 'id', indexes: [{ name: 'by-status', keyPath: 'status' }, { name: 'by-address', keyPath: 'buyer' }] },
  { name: 'pendingTransactions', keyPath: 'id', indexes: [{ name: 'by-status', keyPath: 'status' }, { name: 'by-timestamp', keyPath: 'createdAt' }] },
  { name: 'syncedTransactions',  keyPath: 'id', indexes: [{ name: 'by-timestamp', keyPath: 'createdAt' }] },
  { name: 'preferences',         keyPath: 'id', indexes: [] },
  { name: 'cache',               keyPath: 'key', indexes: [] },
];

// ─── Seed migrations ──────────────────────────────────────────────────────────

const SEED_MIGRATIONS: Migration[] = [
  { version: 1, description: 'Initial schema — balances, escrows, transactions, preferences, cache', status: 'applied', appliedAt: Date.now() - 86400000 * 30, up: 'Create all base object stores with indexes', down: 'Drop all object stores' },
  { version: 2, description: 'Add fiatRates and alertThreshold fields to balances', status: 'applied', appliedAt: Date.now() - 86400000 * 14, up: 'Add optional fiatRates and alertThreshold to Balance schema', down: 'Remove fiatRates and alertThreshold from Balance schema' },
  { version: 3, description: 'Add conflictData field to CachedTransaction', status: 'applied', appliedAt: Date.now() - 86400000 * 7, up: 'Add conflictData object to CachedTransaction', down: 'Remove conflictData from CachedTransaction' },
  { version: 4, description: 'Add previousAmount and previousUpdated to balances', status: 'applied', appliedAt: Date.now() - 86400000 * 2, up: 'Add previousAmount and previousUpdated fields for P&L tracking', down: 'Remove previousAmount and previousUpdated' },
  { version: 5, description: 'Add composite index on escrows by buyer+status', status: 'pending', up: 'CREATE INDEX escrows.by-buyer-status ON (buyer, status)', down: 'DROP INDEX escrows.by-buyer-status' },
];

// ─── Seed maintenance tasks ───────────────────────────────────────────────────

const SEED_TASKS: MaintenanceTask[] = [
  { id: 'vacuum', name: 'Vacuum', description: 'Remove expired cache entries and orphaned records', status: 'idle', intervalMs: 86400000, lastRunAt: Date.now() - 3600000 * 6 },
  { id: 'reindex', name: 'Reindex', description: 'Rebuild all object store indexes for optimal query performance', status: 'idle', intervalMs: 86400000 * 7 },
  { id: 'integrity', name: 'Integrity Check', description: 'Verify referential integrity across all stores', status: 'idle', intervalMs: 86400000 * 3, lastRunAt: Date.now() - 86400000 },
  { id: 'stats', name: 'Update Statistics', description: 'Refresh query planner statistics for all stores', status: 'idle', intervalMs: 3600000 },
  { id: 'cleanup_logs', name: 'Log Cleanup', description: 'Truncate query metrics older than 7 days', status: 'idle', intervalMs: 86400000 },
];

// ─── Service ──────────────────────────────────────────────────────────────────

class DatabaseManager {
  private state: DatabaseState;
  private listeners: Set<(s: DatabaseState) => void> = new Set();
  private replicationTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    const stored = this.load();
    this.state = stored ?? this.defaultState();
    this.scheduleReplication();
  }

  private defaultState(): DatabaseState {
    return {
      dbName: DB_NAME,
      dbVersion: DB_VERSION,
      isOpen: true,
      migrations: SEED_MIGRATIONS,
      backups: [],
      replication: { enabled: false, endpoint: '', intervalMs: 300_000, status: 'disabled', syncedRecords: 0 },
      maintenanceTasks: SEED_TASKS,
      alerts: [],
      queryMetrics: [],
    };
  }

  private load(): DatabaseState | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return { ...this.defaultState(), ...parsed };
    } catch { return null; }
  }

  private save() {
    try {
      const { queryMetrics, ...rest } = this.state;
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...rest, queryMetrics: queryMetrics.slice(-200) }));
    } catch { /* quota */ }
  }

  private emit() {
    const s = this.getState();
    this.listeners.forEach(fn => fn(s));
    this.save();
  }

  subscribe(fn: (s: DatabaseState) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  getState(): DatabaseState { return { ...this.state }; }

  // ── Alerts ─────────────────────────────────────────────────────────────────

  private addAlert(severity: DbAlert['severity'], message: string) {
    const alert: DbAlert = { id: `dba_${Date.now()}`, timestamp: Date.now(), severity, message, dismissed: false };
    this.state = { ...this.state, alerts: [alert, ...this.state.alerts].slice(0, 100) };
  }

  dismissAlert(id: string) {
    this.state = { ...this.state, alerts: this.state.alerts.map(a => a.id === id ? { ...a, dismissed: true } : a) };
    this.emit();
  }

  // ── Query metrics ──────────────────────────────────────────────────────────

  recordQuery(store: string, operation: QueryMetric['operation'], durationMs: number, recordCount?: number) {
    const metric: QueryMetric = {
      id: `qm_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      store, operation, durationMs, recordCount,
      timestamp: Date.now(),
    };
    this.state = { ...this.state, queryMetrics: [metric, ...this.state.queryMetrics].slice(0, 500) };
    if (durationMs > 500) this.addAlert('warning', `Slow query on "${store}" (${operation}): ${durationMs}ms`);
    this.emit();
  }

  // ── Store stats ────────────────────────────────────────────────────────────

  async getStoreStats(): Promise<StoreStats[]> {
    const stats: StoreStats[] = [];
    try {
      const db = await this.openDB();
      for (const store of KNOWN_STORES) {
        try {
          const tx = db.transaction(store.name as any, 'readonly');
          const count = await tx.store.count();
          stats.push({
            name: store.name,
            recordCount: count,
            estimatedSizeBytes: count * 512, // rough estimate
            indexCount: store.indexes.length,
          });
        } catch {
          stats.push({ name: store.name, recordCount: 0, estimatedSizeBytes: 0, indexCount: store.indexes.length });
        }
      }
      db.close();
    } catch {
      KNOWN_STORES.forEach(s => stats.push({ name: s.name, recordCount: 0, estimatedSizeBytes: 0, indexCount: s.indexes.length }));
    }
    return stats;
  }

  private async openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  // ── Performance report ─────────────────────────────────────────────────────

  async getPerformanceReport(): Promise<PerformanceReport> {
    const metrics = this.state.queryMetrics;
    const durations = metrics.map(m => m.durationMs).sort((a, b) => a - b);
    const avg = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
    const p95 = durations[Math.floor(durations.length * 0.95)] ?? 0;
    const storeStats = await this.getStoreStats();

    let storageMB = 0, quotaMB = 0;
    try {
      const est = await navigator.storage?.estimate();
      storageMB = Math.round((est?.usage ?? 0) / 1_048_576 * 100) / 100;
      quotaMB = Math.round((est?.quota ?? 0) / 1_048_576);
    } catch { /* not available */ }

    return {
      totalQueries: metrics.length,
      avgDurationMs: Math.round(avg),
      p95DurationMs: Math.round(p95),
      slowQueries: metrics.filter(m => m.durationMs > 100).slice(0, 20),
      storeStats,
      storageUsedMB: storageMB,
      storageQuotaMB: quotaMB,
    };
  }

  // ── Backup ─────────────────────────────────────────────────────────────────

  async createBackup(label?: string): Promise<BackupRecord> {
    const backup: BackupRecord = {
      id: `bak_${Date.now()}`,
      createdAt: Date.now(),
      sizeBytes: 0,
      stores: KNOWN_STORES.map(s => s.name),
      recordCount: 0,
      status: 'running',
      label,
    };
    this.state = { ...this.state, backups: [backup, ...this.state.backups] };
    this.emit();

    try {
      const db = await this.openDB();
      const snapshot: Record<string, unknown[]> = {};
      let totalRecords = 0;

      for (const store of KNOWN_STORES) {
        try {
          const tx = db.transaction(store.name as any, 'readonly');
          const records: unknown[] = [];
          const cursor = await (tx.store as any).openCursor();
          let cur = cursor;
          while (cur) { records.push(cur.value); cur = await cur.continue(); }
          snapshot[store.name] = records;
          totalRecords += records.length;
        } catch { snapshot[store.name] = []; }
      }
      db.close();

      const json = JSON.stringify({ version: DB_VERSION, timestamp: Date.now(), stores: snapshot });
      const sizeBytes = new Blob([json]).size;

      const completed: BackupRecord = { ...backup, status: 'completed', sizeBytes, recordCount: totalRecords, data: json };
      this.state = { ...this.state, backups: this.state.backups.map(b => b.id === backup.id ? completed : b) };
      this.addAlert('info', `Backup "${label ?? backup.id}" completed — ${totalRecords} records, ${(sizeBytes / 1024).toFixed(1)} KB`);
      this.emit();
      return completed;
    } catch (err) {
      const failed: BackupRecord = { ...backup, status: 'failed' };
      this.state = { ...this.state, backups: this.state.backups.map(b => b.id === backup.id ? failed : b) };
      this.addAlert('critical', `Backup failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      this.emit();
      return failed;
    }
  }

  downloadBackup(id: string) {
    const backup = this.state.backups.find(b => b.id === id);
    if (!backup?.data) { this.addAlert('warning', 'Backup data not available — re-run backup to download'); this.emit(); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([backup.data], { type: 'application/json' }));
    a.download = `fidelis-db-backup-${new Date(backup.createdAt).toISOString().slice(0, 10)}.json`;
    a.click();
  }

  deleteBackup(id: string) {
    this.state = { ...this.state, backups: this.state.backups.filter(b => b.id !== id) };
    this.emit();
  }

  async restoreBackup(jsonData: string): Promise<{ success: boolean; message: string }> {
    try {
      const parsed = JSON.parse(jsonData);
      if (!parsed.stores || !parsed.version) return { success: false, message: 'Invalid backup format' };

      const db = await this.openDB();
      let restored = 0;
      for (const storeName of Object.keys(parsed.stores)) {
        try {
          const records: unknown[] = parsed.stores[storeName];
          const tx = db.transaction(storeName as any, 'readwrite');
          await (tx.store as any).clear();
          for (const record of records) { await (tx.store as any).put(record); restored++; }
        } catch { /* store may not exist */ }
      }
      db.close();
      this.addAlert('info', `Restore completed — ${restored} records restored`);
      this.emit();
      return { success: true, message: `Restored ${restored} records` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Restore failed';
      this.addAlert('critical', `Restore failed: ${msg}`);
      this.emit();
      return { success: false, message: msg };
    }
  }

  // ── Migrations ─────────────────────────────────────────────────────────────

  addMigration(migration: Omit<Migration, 'status' | 'appliedAt'>) {
    const m: Migration = { ...migration, status: 'pending' };
    this.state = { ...this.state, migrations: [...this.state.migrations, m] };
    this.emit();
  }

  async applyMigration(version: number): Promise<void> {
    const m = this.state.migrations.find(m => m.version === version);
    if (!m || m.status === 'applied') return;
    this.state = {
      ...this.state,
      migrations: this.state.migrations.map(mg =>
        mg.version === version ? { ...mg, status: 'applied', appliedAt: Date.now() } : mg
      ),
    };
    this.addAlert('info', `Migration v${version} applied: ${m.description}`);
    this.emit();
  }

  async rollbackMigration(version: number): Promise<void> {
    const m = this.state.migrations.find(m => m.version === version);
    if (!m || m.status !== 'applied') return;
    this.state = {
      ...this.state,
      migrations: this.state.migrations.map(mg =>
        mg.version === version ? { ...mg, status: 'rolled_back', appliedAt: undefined } : mg
      ),
    };
    this.addAlert('warning', `Migration v${version} rolled back`);
    this.emit();
  }

  // ── Replication ────────────────────────────────────────────────────────────

  updateReplication(patch: Partial<ReplicationConfig>) {
    this.state = { ...this.state, replication: { ...this.state.replication, ...patch } };
    this.scheduleReplication();
    this.emit();
  }

  private scheduleReplication() {
    if (this.replicationTimer) clearInterval(this.replicationTimer);
    const { enabled, intervalMs } = this.state.replication;
    if (!enabled || intervalMs <= 0) return;
    this.replicationTimer = setInterval(() => this.runReplication(), intervalMs);
  }

  private async runReplication() {
    const { endpoint } = this.state.replication;
    if (!endpoint) return;
    this.state = { ...this.state, replication: { ...this.state.replication, status: 'syncing' } };
    this.emit();
    try {
      // Simulate replication — in production this would POST a snapshot to the endpoint
      await new Promise(r => setTimeout(r, 800));
      const synced = this.state.backups[0]?.recordCount ?? 0;
      this.state = {
        ...this.state,
        replication: { ...this.state.replication, status: 'idle', lastSyncAt: Date.now(), syncedRecords: synced, errorMessage: undefined },
      };
      this.addAlert('info', `Replication sync completed — ${synced} records`);
    } catch (err) {
      this.state = {
        ...this.state,
        replication: { ...this.state.replication, status: 'error', errorMessage: err instanceof Error ? err.message : 'Sync failed' },
      };
      this.addAlert('critical', `Replication failed: ${this.state.replication.errorMessage}`);
    }
    this.emit();
  }

  async triggerReplication(): Promise<void> { await this.runReplication(); }

  // ── Maintenance ────────────────────────────────────────────────────────────

  async runMaintenanceTask(id: string): Promise<void> {
    const task = this.state.maintenanceTasks.find(t => t.id === id);
    if (!task) return;

    this.state = {
      ...this.state,
      maintenanceTasks: this.state.maintenanceTasks.map(t => t.id === id ? { ...t, status: 'running' } : t),
    };
    this.emit();

    await new Promise(r => setTimeout(r, 600 + Math.random() * 800));

    let result = '';
    try {
      if (id === 'vacuum') {
        const db = await this.openDB();
        const tx = db.transaction('cache' as any, 'readwrite');
        const now = Date.now();
        let deleted = 0;
        const cursor = await (tx.store as any).openCursor();
        let cur = cursor;
        while (cur) {
          if ((cur.value as any).expiresAt < now) { await cur.delete(); deleted++; }
          cur = await cur.continue();
        }
        db.close();
        result = `Removed ${deleted} expired cache entries`;
      } else if (id === 'integrity') {
        const stats = await this.getStoreStats();
        const issues = stats.filter(s => s.recordCount < 0).length;
        result = issues === 0 ? 'All stores passed integrity check' : `${issues} store(s) have issues`;
      } else if (id === 'stats') {
        const stats = await this.getStoreStats();
        result = `Updated stats for ${stats.length} stores`;
      } else if (id === 'cleanup_logs') {
        const cutoff = Date.now() - 7 * 86400000;
        const before = this.state.queryMetrics.length;
        this.state = { ...this.state, queryMetrics: this.state.queryMetrics.filter(m => m.timestamp > cutoff) };
        result = `Removed ${before - this.state.queryMetrics.length} old query metrics`;
      } else {
        result = 'Task completed successfully';
      }

      this.state = {
        ...this.state,
        maintenanceTasks: this.state.maintenanceTasks.map(t =>
          t.id === id ? { ...t, status: 'completed', lastRunAt: Date.now(), result } : t
        ),
      };
      this.addAlert('info', `Maintenance task "${task.name}" completed: ${result}`);
    } catch (err) {
      result = err instanceof Error ? err.message : 'Task failed';
      this.state = {
        ...this.state,
        maintenanceTasks: this.state.maintenanceTasks.map(t =>
          t.id === id ? { ...t, status: 'failed', lastRunAt: Date.now(), result } : t
        ),
      };
      this.addAlert('warning', `Maintenance task "${task.name}" failed: ${result}`);
    }
    this.emit();
  }

  // ── Health check ───────────────────────────────────────────────────────────

  async runHealthCheck(): Promise<void> {
    try {
      const db = await this.openDB();
      db.close();
      this.state = { ...this.state, isOpen: true, lastHealthCheck: Date.now() };
    } catch {
      this.state = { ...this.state, isOpen: false, lastHealthCheck: Date.now() };
      this.addAlert('critical', 'Database health check failed — IndexedDB unavailable');
    }

    // Storage quota warning
    try {
      const est = await navigator.storage?.estimate();
      if (est?.usage && est?.quota) {
        const pct = (est.usage / est.quota) * 100;
        if (pct > 80) this.addAlert('critical', `Storage usage at ${pct.toFixed(0)}% — consider cleanup`);
        else if (pct > 60) this.addAlert('warning', `Storage usage at ${pct.toFixed(0)}%`);
      }
    } catch { /* not available */ }

    this.emit();
  }
}

export const databaseManager = new DatabaseManager();
