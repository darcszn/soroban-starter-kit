import React, { useEffect, useRef, useState } from 'react';
import { useDatabase } from '../context/DatabaseContext';
import type { PerformanceReport } from '../services/database/types';

// ─── Shared primitives ────────────────────────────────────────────────────────

const SEV_COLOR: Record<string, string> = {
  info: 'var(--color-success)', warning: 'var(--color-warning)', critical: 'var(--color-error)',
};

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: color + '22', color, border: `1px solid ${color}44`, textTransform: 'capitalize' }}>
      {label}
    </span>
  );
}

function Btn({ children, onClick, variant = 'default', disabled, small }: {
  children: React.ReactNode; onClick?: () => void;
  variant?: 'default' | 'danger' | 'success' | 'warning'; disabled?: boolean; small?: boolean;
}) {
  const col = { default: 'var(--color-text-primary)', danger: 'var(--color-error)', success: 'var(--color-success)', warning: 'var(--color-warning)' }[variant];
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: small ? '3px 10px' : '6px 14px', fontSize: small ? 11 : 13,
      background: col + '18', color: col, border: `1px solid ${col}44`,
      borderRadius: 4, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
    }}>
      {children}
    </button>
  );
}

function Card({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>{title}</span>
        {action}
      </div>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--color-border)', fontSize: 13 }}>
      <span style={{ color: 'var(--color-text-muted)' }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function Input({ value, onChange, placeholder, type = 'text' }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      style={{ width: '100%', padding: '7px 10px', background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', borderRadius: 4, fontSize: 13, boxSizing: 'border-box' }}
    />
  );
}

function timeAgo(ts: number) {
  const d = Date.now() - ts;
  if (d < 60000) return 'just now';
  if (d < 3600000) return `${Math.floor(d / 60000)}m ago`;
  if (d < 86400000) return `${Math.floor(d / 3600000)}h ago`;
  return `${Math.floor(d / 86400000)}d ago`;
}

function fmtBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1_048_576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1_048_576).toFixed(2)} MB`;
}

// ─── Tab: Overview ────────────────────────────────────────────────────────────

function OverviewTab() {
  const { dbName, dbVersion, isOpen, lastHealthCheck, alerts, runHealthCheck, dismissAlert } = useDatabase();
  const [checking, setChecking] = useState(false);
  const activeAlerts = alerts.filter(a => !a.dismissed);

  async function handleCheck() {
    setChecking(true);
    await runHealthCheck();
    setChecking(false);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Status card */}
      <Card title="Database Status" action={<Btn onClick={handleCheck} disabled={checking}>{checking ? 'Checking…' : '↻ Health Check'}</Btn>}>
        <Row label="Database" value={<code style={{ fontSize: 12 }}>{dbName}</code>} />
        <Row label="Version" value={`v${dbVersion}`} />
        <Row label="Status" value={<Badge label={isOpen ? 'open' : 'closed'} color={isOpen ? 'var(--color-success)' : 'var(--color-error)'} />} />
        <Row label="Engine" value="IndexedDB (idb)" />
        <Row label="Last health check" value={lastHealthCheck ? timeAgo(lastHealthCheck) : '—'} />
      </Card>

      {/* Schema overview */}
      <Card title="Object Stores">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
          {[
            { name: 'balances', indexes: 2, desc: 'Token balances per address' },
            { name: 'escrows', indexes: 2, desc: 'Escrow contract states' },
            { name: 'pendingTransactions', indexes: 2, desc: 'Offline transaction queue' },
            { name: 'syncedTransactions', indexes: 1, desc: 'Confirmed transaction history' },
            { name: 'preferences', indexes: 0, desc: 'User preferences' },
            { name: 'cache', indexes: 0, desc: 'General-purpose cache' },
          ].map(s => (
            <div key={s.name} style={{ padding: 10, background: 'var(--color-bg-tertiary)', borderRadius: 6, borderLeft: '3px solid var(--color-highlight)' }}>
              <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 4 }}>{s.name}</div>
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 4 }}>{s.desc}</div>
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{s.indexes} index{s.indexes !== 1 ? 'es' : ''}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Active alerts */}
      {activeAlerts.length > 0 && (
        <Card title={`Alerts (${activeAlerts.length})`}>
          {activeAlerts.map(a => (
            <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--color-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Badge label={a.severity} color={SEV_COLOR[a.severity]} />
                <span style={{ fontSize: 13 }}>{a.message}</span>
                <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{timeAgo(a.timestamp)}</span>
              </div>
              <Btn small onClick={() => dismissAlert(a.id)}>Dismiss</Btn>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

// ─── Tab: Performance ─────────────────────────────────────────────────────────

function PerformanceTab() {
  const { getPerformanceReport } = useDatabase();
  const [report, setReport] = useState<PerformanceReport | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    setReport(await getPerformanceReport());
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const maxCount = report ? Math.max(...report.storeStats.map(s => s.recordCount), 1) : 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Btn onClick={load} disabled={loading}>{loading ? 'Loading…' : '↻ Refresh'}</Btn>
      </div>

      {report && (
        <>
          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
            {[
              { label: 'Total Queries', value: report.totalQueries },
              { label: 'Avg Latency', value: `${report.avgDurationMs}ms` },
              { label: 'p95 Latency', value: `${report.p95DurationMs}ms` },
              { label: 'Slow Queries', value: report.slowQueries.length, warn: report.slowQueries.length > 0 },
              { label: 'Storage Used', value: `${report.storageUsedMB} MB` },
              { label: 'Storage Quota', value: `${report.storageQuotaMB} MB` },
            ].map(k => (
              <div key={k.label} className="card" style={{ padding: '12px 16px' }}>
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 4 }}>{k.label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: k.warn ? 'var(--color-warning)' : 'var(--color-text-primary)' }}>{k.value}</div>
              </div>
            ))}
          </div>

          {/* Storage usage bar */}
          {report.storageQuotaMB > 0 && (
            <Card title="Storage Usage">
              <div style={{ marginBottom: 6, fontSize: 12, color: 'var(--color-text-muted)' }}>
                {report.storageUsedMB} MB used of {report.storageQuotaMB} MB
              </div>
              <div style={{ height: 12, background: 'var(--color-bg-tertiary)', borderRadius: 6, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 6, transition: 'width 0.4s',
                  width: `${Math.min(100, (report.storageUsedMB / report.storageQuotaMB) * 100)}%`,
                  background: (report.storageUsedMB / report.storageQuotaMB) > 0.8 ? 'var(--color-error)' : 'var(--color-highlight)',
                }} />
              </div>
            </Card>
          )}

          {/* Store stats */}
          <Card title="Store Record Counts">
            {report.storeStats.map(s => (
              <div key={s.name} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                  <span style={{ fontWeight: 500 }}>{s.name}</span>
                  <span style={{ color: 'var(--color-text-muted)' }}>{s.recordCount} records · ~{fmtBytes(s.estimatedSizeBytes)}</span>
                </div>
                <div style={{ height: 8, background: 'var(--color-bg-tertiary)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 4, background: 'var(--color-highlight)', width: `${(s.recordCount / maxCount) * 100}%`, transition: 'width 0.4s' }} />
                </div>
              </div>
            ))}
          </Card>

          {/* Slow queries */}
          {report.slowQueries.length > 0 && (
            <Card title={`Slow Queries (>100ms) — ${report.slowQueries.length}`}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                      {['Store', 'Operation', 'Duration', 'Records', 'Time'].map(h => (
                        <th key={h} style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--color-text-muted)', fontWeight: 600, fontSize: 11 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.slowQueries.map(q => (
                      <tr key={q.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <td style={{ padding: '6px 10px' }}>{q.store}</td>
                        <td style={{ padding: '6px 10px' }}><Badge label={q.operation} color="var(--color-warning)" /></td>
                        <td style={{ padding: '6px 10px', color: 'var(--color-warning)', fontWeight: 600 }}>{q.durationMs}ms</td>
                        <td style={{ padding: '6px 10px' }}>{q.recordCount ?? '—'}</td>
                        <td style={{ padding: '6px 10px', color: 'var(--color-text-muted)' }}>{timeAgo(q.timestamp)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

// ─── Tab: Backup & Recovery ───────────────────────────────────────────────────

function BackupTab() {
  const { backups, createBackup, downloadBackup, deleteBackup, restoreBackup } = useDatabase();
  const [label, setLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const [restoreMsg, setRestoreMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleCreate() {
    setCreating(true);
    await createBackup(label || undefined);
    setLabel('');
    setCreating(false);
  }

  async function handleRestore(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const result = await restoreBackup(text);
    setRestoreMsg({ ok: result.success, text: result.message });
    if (fileRef.current) fileRef.current.value = '';
  }

  const STATUS_COLOR: Record<string, string> = { completed: 'var(--color-success)', running: 'var(--color-warning)', failed: 'var(--color-error)', idle: 'var(--color-text-muted)' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Create backup */}
      <Card title="Create Backup">
        <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
          <div style={{ flex: 1 }}><Input value={label} onChange={setLabel} placeholder="Optional label (e.g. pre-migration)" /></div>
          <Btn variant="success" onClick={handleCreate} disabled={creating}>{creating ? 'Creating…' : '+ Create Backup'}</Btn>
        </div>
        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: 0 }}>
          Snapshots all IndexedDB stores to a JSON file. Download immediately after creation — data is not persisted across sessions.
        </p>
      </Card>

      {/* Restore */}
      <Card title="Restore from File">
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input ref={fileRef} type="file" accept=".json" onChange={handleRestore}
            style={{ fontSize: 13, color: 'var(--color-text-primary)' }} />
        </div>
        {restoreMsg && (
          <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 4, background: restoreMsg.ok ? '#00d26a18' : '#dc354518', color: restoreMsg.ok ? 'var(--color-success)' : 'var(--color-error)', fontSize: 13 }}>
            {restoreMsg.ok ? '✓' : '✗'} {restoreMsg.text}
          </div>
        )}
      </Card>

      {/* Backup list */}
      <Card title={`Backups (${backups.length})`}>
        {backups.length === 0 && <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>No backups yet.</p>}
        {backups.map(b => (
          <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--color-border)', gap: 10 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Badge label={b.status} color={STATUS_COLOR[b.status]} />
                {b.label && <span style={{ fontSize: 13, fontWeight: 500 }}>{b.label}</span>}
                <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{timeAgo(b.createdAt)}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                {b.recordCount} records · {fmtBytes(b.sizeBytes)} · {b.stores.length} stores
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {b.status === 'completed' && b.data && <Btn small onClick={() => downloadBackup(b.id)}>↓ Download</Btn>}
              <Btn small variant="danger" onClick={() => { if (confirm('Delete this backup?')) deleteBackup(b.id); }}>Delete</Btn>
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

// ─── Tab: Migrations ──────────────────────────────────────────────────────────

function MigrationsTab() {
  const { migrations, addMigration, applyMigration, rollbackMigration } = useDatabase();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ version: '', description: '', up: '', down: '' });

  function handleAdd() {
    if (!form.version || !form.description) return;
    addMigration({ version: Number(form.version), description: form.description, up: form.up, down: form.down });
    setForm({ version: '', description: '', up: '', down: '' });
    setShowForm(false);
  }

  const STATUS_COLOR: Record<string, string> = { applied: 'var(--color-success)', pending: 'var(--color-warning)', failed: 'var(--color-error)', rolled_back: 'var(--color-text-muted)' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Btn onClick={() => setShowForm(v => !v)}>+ Add Migration</Btn>
      </div>

      {showForm && (
        <Card title="New Migration">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div><label style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Version</label><Input value={form.version} onChange={v => setForm(f => ({ ...f, version: v }))} type="number" placeholder="6" /></div>
            <div><label style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Description</label><Input value={form.description} onChange={v => setForm(f => ({ ...f, description: v }))} placeholder="Add index on escrows.deadline" /></div>
            <div><label style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Up (upgrade)</label><Input value={form.up} onChange={v => setForm(f => ({ ...f, up: v }))} placeholder="CREATE INDEX ..." /></div>
            <div><label style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Down (rollback)</label><Input value={form.down} onChange={v => setForm(f => ({ ...f, down: v }))} placeholder="DROP INDEX ..." /></div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn variant="success" onClick={handleAdd}>Add</Btn>
            <Btn onClick={() => setShowForm(false)}>Cancel</Btn>
          </div>
        </Card>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
              {['Version', 'Description', 'Status', 'Applied', 'Up', 'Actions'].map(h => (
                <th key={h} style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--color-text-muted)', fontWeight: 600, fontSize: 12 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...migrations].sort((a, b) => b.version - a.version).map(m => (
              <tr key={m.version} style={{ borderBottom: '1px solid var(--color-border)' }}>
                <td style={{ padding: '10px 10px', fontWeight: 700 }}>v{m.version}</td>
                <td style={{ padding: '10px 10px' }}>{m.description}</td>
                <td style={{ padding: '10px 10px' }}><Badge label={m.status.replace('_', ' ')} color={STATUS_COLOR[m.status]} /></td>
                <td style={{ padding: '10px 10px', color: 'var(--color-text-muted)', fontSize: 12 }}>{m.appliedAt ? timeAgo(m.appliedAt) : '—'}</td>
                <td style={{ padding: '10px 10px', fontSize: 11, color: 'var(--color-text-muted)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.up}</td>
                <td style={{ padding: '10px 10px' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {m.status === 'pending' && <Btn small variant="success" onClick={() => applyMigration(m.version)}>Apply</Btn>}
                    {m.status === 'applied' && <Btn small variant="warning" onClick={() => { if (confirm(`Rollback migration v${m.version}?`)) rollbackMigration(m.version); }}>Rollback</Btn>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Tab: Replication ─────────────────────────────────────────────────────────

function ReplicationTab() {
  const { replication, updateReplication, triggerReplication } = useDatabase();
  const [syncing, setSyncing] = useState(false);
  const [endpoint, setEndpoint] = useState(replication.endpoint);
  const [intervalSec, setIntervalSec] = useState(String(replication.intervalMs / 1000));

  const STATUS_COLOR: Record<string, string> = { idle: 'var(--color-success)', syncing: 'var(--color-warning)', error: 'var(--color-error)', disabled: 'var(--color-text-muted)' };

  async function handleSync() {
    setSyncing(true);
    await triggerReplication();
    setSyncing(false);
  }

  function handleSave() {
    updateReplication({ endpoint, intervalMs: Number(intervalSec) * 1000 });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Status */}
      <Card title="Replication Status">
        <Row label="Status" value={<Badge label={replication.status} color={STATUS_COLOR[replication.status]} />} />
        <Row label="Enabled" value={replication.enabled ? '✓ Yes' : '✗ No'} />
        <Row label="Last sync" value={replication.lastSyncAt ? timeAgo(replication.lastSyncAt) : '—'} />
        <Row label="Synced records" value={replication.syncedRecords} />
        {replication.errorMessage && <Row label="Last error" value={<span style={{ color: 'var(--color-error)', fontSize: 12 }}>{replication.errorMessage}</span>} />}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <Btn variant={replication.enabled ? 'warning' : 'success'} onClick={() => updateReplication({ enabled: !replication.enabled, status: replication.enabled ? 'disabled' : 'idle' })}>
            {replication.enabled ? 'Disable' : 'Enable'} Replication
          </Btn>
          {replication.enabled && <Btn onClick={handleSync} disabled={syncing}>{syncing ? 'Syncing…' : '↻ Sync Now'}</Btn>}
        </div>
      </Card>

      {/* Config */}
      <Card title="Configuration">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
          <div>
            <label style={{ fontSize: 12, color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>Replication Endpoint URL</label>
            <Input value={endpoint} onChange={setEndpoint} placeholder="https://replica.example.com/sync" />
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>Sync Interval (seconds)</label>
            <Input value={intervalSec} onChange={setIntervalSec} type="number" placeholder="300" />
          </div>
        </div>
        <Btn variant="success" onClick={handleSave}>Save Configuration</Btn>
      </Card>

      {/* HA info */}
      <Card title="High Availability Notes">
        <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
          <p style={{ margin: '0 0 8px' }}>This app uses <strong>IndexedDB</strong> as its primary data store. For high availability:</p>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            <li>Enable replication to push snapshots to a remote endpoint on a schedule.</li>
            <li>Use the Backup tab to create manual snapshots before major operations.</li>
            <li>The sync service handles conflict resolution between local and server state.</li>
            <li>In production, pair with a Stellar Horizon node for authoritative on-chain state.</li>
          </ul>
        </div>
      </Card>
    </div>
  );
}

// ─── Tab: Maintenance ─────────────────────────────────────────────────────────

function MaintenanceTab() {
  const { maintenanceTasks, runMaintenanceTask } = useDatabase();
  const [running, setRunning] = useState<string | null>(null);

  async function handleRun(id: string) {
    setRunning(id);
    await runMaintenanceTask(id);
    setRunning(null);
  }

  const STATUS_COLOR: Record<string, string> = { idle: 'var(--color-text-muted)', running: 'var(--color-warning)', completed: 'var(--color-success)', failed: 'var(--color-error)' };

  function nextRun(task: typeof maintenanceTasks[0]) {
    if (!task.intervalMs) return 'Manual only';
    const base = task.lastRunAt ?? Date.now();
    const next = base + task.intervalMs;
    return next > Date.now() ? `in ${timeAgo(Date.now() - (next - Date.now() * 2))}` : 'Due now';
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {maintenanceTasks.map(task => (
        <div key={task.id} className="card" style={{ padding: 16, borderLeft: `3px solid ${STATUS_COLOR[task.status]}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{task.name}</span>
                <Badge label={task.status} color={STATUS_COLOR[task.status]} />
              </div>
              <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 6 }}>{task.description}</div>
              <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--color-text-muted)' }}>
                <span>Last run: {task.lastRunAt ? timeAgo(task.lastRunAt) : '—'}</span>
                <span>Next: {nextRun(task)}</span>
                {task.result && <span style={{ color: task.status === 'failed' ? 'var(--color-error)' : 'var(--color-text-muted)' }}>Result: {task.result}</span>}
              </div>
            </div>
            <Btn
              onClick={() => handleRun(task.id)}
              disabled={running === task.id || task.status === 'running'}
              variant={task.status === 'failed' ? 'warning' : 'default'}
            >
              {running === task.id ? 'Running…' : '▶ Run'}
            </Btn>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Root DatabasePanel ───────────────────────────────────────────────────────

type DbTab = 'overview' | 'performance' | 'backup' | 'migrations' | 'replication' | 'maintenance';

export function DatabasePanel(): JSX.Element {
  const { dbName, dbVersion, isOpen, alerts, migrations } = useDatabase();
  const [tab, setTab] = useState<DbTab>('overview');

  const activeAlerts = alerts.filter(a => !a.dismissed).length;
  const pendingMigrations = migrations.filter(m => m.status === 'pending').length;

  const tabs: { id: DbTab; label: string }[] = [
    { id: 'overview', label: `🗄 Overview${activeAlerts ? ` (${activeAlerts})` : ''}` },
    { id: 'performance', label: '📊 Performance' },
    { id: 'backup', label: '💾 Backup & Recovery' },
    { id: 'migrations', label: `🔄 Migrations${pendingMigrations ? ` (${pendingMigrations})` : ''}` },
    { id: 'replication', label: '🔁 Replication & HA' },
    { id: 'maintenance', label: '🔧 Maintenance' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Database Management</h2>
          <Badge label={isOpen ? 'connected' : 'disconnected'} color={isOpen ? 'var(--color-success)' : 'var(--color-error)'} />
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
          <code>{dbName}</code> · v{dbVersion} · IndexedDB
        </div>
      </div>

      {/* Tabs */}
      <div role="tablist" style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--color-border)', flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} style={{
            padding: '8px 14px', fontSize: 13, background: 'none', border: 'none', cursor: 'pointer',
            color: tab === t.id ? 'var(--color-highlight)' : 'var(--color-text-muted)',
            borderBottom: tab === t.id ? '2px solid var(--color-highlight)' : '2px solid transparent',
            fontWeight: tab === t.id ? 600 : 400,
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab panels */}
      <div role="tabpanel">
        {tab === 'overview' && <OverviewTab />}
        {tab === 'performance' && <PerformanceTab />}
        {tab === 'backup' && <BackupTab />}
        {tab === 'migrations' && <MigrationsTab />}
        {tab === 'replication' && <ReplicationTab />}
        {tab === 'maintenance' && <MaintenanceTab />}
      </div>
    </div>
  );
}
