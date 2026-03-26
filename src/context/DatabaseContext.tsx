import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { databaseManager } from '../services/database/databaseManager';
import type { DatabaseState, ReplicationConfig, PerformanceReport, Migration } from '../services/database/types';

interface DatabaseContextType extends DatabaseState {
  runHealthCheck: () => Promise<void>;
  createBackup: (label?: string) => Promise<void>;
  downloadBackup: (id: string) => void;
  deleteBackup: (id: string) => void;
  restoreBackup: (json: string) => Promise<{ success: boolean; message: string }>;
  addMigration: (m: Omit<Migration, 'status' | 'appliedAt'>) => void;
  applyMigration: (version: number) => Promise<void>;
  rollbackMigration: (version: number) => Promise<void>;
  updateReplication: (patch: Partial<ReplicationConfig>) => void;
  triggerReplication: () => Promise<void>;
  runMaintenanceTask: (id: string) => Promise<void>;
  getPerformanceReport: () => Promise<PerformanceReport>;
  dismissAlert: (id: string) => void;
  recordQuery: (store: string, op: 'read' | 'write' | 'delete' | 'count', ms: number, count?: number) => void;
}

const DatabaseContext = createContext<DatabaseContextType | undefined>(undefined);

export function DatabaseProvider({ children }: { children: ReactNode }): JSX.Element {
  const [state, setState] = useState<DatabaseState>(databaseManager.getState());

  useEffect(() => {
    const unsub = databaseManager.subscribe(setState);
    databaseManager.runHealthCheck();
    return unsub;
  }, []);

  const value: DatabaseContextType = {
    ...state,
    runHealthCheck: () => databaseManager.runHealthCheck(),
    createBackup: (label) => databaseManager.createBackup(label).then(() => {}),
    downloadBackup: (id) => databaseManager.downloadBackup(id),
    deleteBackup: (id) => databaseManager.deleteBackup(id),
    restoreBackup: (json) => databaseManager.restoreBackup(json),
    addMigration: (m) => databaseManager.addMigration(m),
    applyMigration: (v) => databaseManager.applyMigration(v),
    rollbackMigration: (v) => databaseManager.rollbackMigration(v),
    updateReplication: (p) => databaseManager.updateReplication(p),
    triggerReplication: () => databaseManager.triggerReplication(),
    runMaintenanceTask: (id) => databaseManager.runMaintenanceTask(id),
    getPerformanceReport: () => databaseManager.getPerformanceReport(),
    dismissAlert: (id) => databaseManager.dismissAlert(id),
    recordQuery: (s, op, ms, c) => databaseManager.recordQuery(s, op, ms, c),
  };

  return <DatabaseContext.Provider value={value}>{children}</DatabaseContext.Provider>;
}

export function useDatabase(): DatabaseContextType {
  const ctx = useContext(DatabaseContext);
  if (!ctx) throw new Error('useDatabase must be used within DatabaseProvider');
  return ctx;
}
