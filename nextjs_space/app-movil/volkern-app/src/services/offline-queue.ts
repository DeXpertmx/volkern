import * as SecureStore from 'expo-secure-store';
import { networkService } from './network';
import { api } from './api';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface QueuedOperation {
  id: string;
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  endpoint: string;
  body?: unknown;
  timestamp: number;
  retries: number;
  maxRetries: number;
  label: string; // Human-readable description (e.g. "Enviar mensaje", "Actualizar lead")
  status: 'pending' | 'syncing' | 'failed' | 'completed';
  lastError?: string;
}

export interface SyncEntry {
  id: string;
  timestamp: number;
  total: number;
  succeeded: number;
  failed: number;
  duration: number; // ms
  status: 'completed' | 'partial' | 'failed';
}

// ─── Constants ────────────────────────────────────────────────────────────────
const QUEUE_KEY = 'volkern_offline_queue';
const HISTORY_KEY = 'volkern_sync_history';
const LAST_SYNC_KEY = 'volkern_last_sync';
const MAX_RETRIES_DEFAULT = 3;
const MAX_HISTORY = 20;

// ─── Service ──────────────────────────────────────────────────────────────────
class OfflineQueue {
  private queue: QueuedOperation[] = [];
  private loaded = false;
  private processing = false;

  // ─── Load / Save ──────────────────────────────────────────────────────

  async load(): Promise<void> {
    if (this.loaded) return;
    try {
      const raw = await SecureStore.getItemAsync(QUEUE_KEY);
      if (raw) {
        this.queue = JSON.parse(raw) as QueuedOperation[];
      }
    } catch {
      this.queue = [];
    } finally {
      this.loaded = true;
    }
  }

  private async save(): Promise<void> {
    try {
      await SecureStore.setItemAsync(QUEUE_KEY, JSON.stringify(this.queue));
    } catch {
      console.error('[OfflineQueue] Error saving queue');
    }
  }

  // ─── Enqueue ──────────────────────────────────────────────────────────

  async enqueue(op: Omit<QueuedOperation, 'id' | 'timestamp' | 'retries' | 'maxRetries' | 'status'> & { maxRetries?: number }): Promise<void> {
    await this.load();
    const operation: QueuedOperation = {
      ...op,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      retries: 0,
      maxRetries: op.maxRetries ?? MAX_RETRIES_DEFAULT,
      status: 'pending',
    };
    this.queue.push(operation);
    await this.save();
  }

  // ─── Queue access ──────────────────────────────────────────────────────

  get pendingCount(): number {
    return this.queue.filter((op) => op.status === 'pending').length;
  }

  /** Total operations in queue (any status) */
  get totalCount(): number {
    return this.queue.length;
  }

  async getPendingOperations(): Promise<QueuedOperation[]> {
    await this.load();
    return this.queue.filter((op) => op.status === 'pending').map((op) => ({ ...op }));
  }

  async getAllOperations(): Promise<QueuedOperation[]> {
    await this.load();
    return this.queue.map((op) => ({ ...op }));
  }

  /** Removes a single operation from the queue by ID */
  async deleteOperation(id: string): Promise<void> {
    await this.load();
    this.queue = this.queue.filter((op) => op.id !== id);
    await this.save();
  }

  /** Remove all operations with a given status */
  async clearByStatus(status: QueuedOperation['status']): Promise<void> {
    await this.load();
    this.queue = this.queue.filter((op) => op.status !== status);
    await this.save();
  }

  // ─── Replay Queue ─────────────────────────────────────────────────────

  async replayQueue(onProgress?: (progress: number) => void): Promise<{ succeeded: number; failed: number }> {
    if (this.processing) return { succeeded: 0, failed: 0 };
    this.processing = true;

    await this.load();
    const pending = this.queue.filter((op) => op.status === 'pending');
    if (pending.length === 0) {
      this.processing = false;
      return { succeeded: 0, failed: 0 };
    }

    const total = pending.length;
    let succeeded = 0;
    let failed = 0;
    const startTime = Date.now();

    for (const op of pending) {
      // Mark as syncing
      op.status = 'syncing';
      await this.save();

      try {
        await this.executeOperation(op);
        op.status = 'completed';
        succeeded++;
      } catch (e: any) {
        console.error(`[OfflineQueue] Failed: ${op.label}`, e);
        op.lastError = e?.message || 'Unknown error';
        if (op.retries < op.maxRetries) {
          op.retries++;
          op.status = 'pending';
        } else {
          op.status = 'failed';
          failed++;
        }
      }

      await this.save();
      onProgress?.(Math.round(((succeeded + failed) / total) * 100));
    }

    // Record sync history entry
    const duration = Date.now() - startTime;
    const syncStatus: SyncEntry['status'] =
      failed === 0 ? 'completed' : succeeded > 0 ? 'partial' : 'failed';

    await this.addHistoryEntry({
      total,
      succeeded,
      failed,
      duration,
      status: syncStatus,
    });

    // Update last sync timestamp
    await SecureStore.setItemAsync(LAST_SYNC_KEY, String(Date.now()));

    // Clean up completed operations from queue
    this.queue = this.queue.filter((op) => op.status !== 'completed');
    await this.save();

    this.processing = false;

    return { succeeded, failed };
  }

  // ─── Sync History ─────────────────────────────────────────────────────

  async getLastSyncTimestamp(): Promise<number | null> {
    try {
      const raw = await SecureStore.getItemAsync(LAST_SYNC_KEY);
      return raw ? parseInt(raw, 10) : null;
    } catch {
      return null;
    }
  }

  async getHistory(): Promise<SyncEntry[]> {
    try {
      const raw = await SecureStore.getItemAsync(HISTORY_KEY);
      if (raw) {
        return JSON.parse(raw) as SyncEntry[];
      }
    } catch {
      // ignore
    }
    return [];
  }

  private async addHistoryEntry(entry: Omit<SyncEntry, 'id' | 'timestamp'>): Promise<void> {
    try {
      const history = await this.getHistory();
      history.unshift({
        ...entry,
        id: `sync-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: Date.now(),
      });
      // Keep only last MAX_HISTORY entries
      if (history.length > MAX_HISTORY) {
        history.length = MAX_HISTORY;
      }
      await SecureStore.setItemAsync(HISTORY_KEY, JSON.stringify(history));
    } catch {
      console.error('[OfflineQueue] Error saving sync history');
    }
  }

  async clearHistory(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(HISTORY_KEY);
    } catch {
      // ignore
    }
  }

  // ─── Clear All ─────────────────────────────────────────────────────────

  async clear(): Promise<void> {
    this.queue = [];
    await this.save();
  }

  async clearAll(): Promise<void> {
    this.queue = [];
    await this.save();
    await this.clearHistory();
    try {
      await SecureStore.deleteItemAsync(LAST_SYNC_KEY);
    } catch {
      // ignore
    }
  }

  // ─── Private ──────────────────────────────────────────────────────────

  private async executeOperation(op: QueuedOperation): Promise<void> {
    switch (op.method) {
      case 'POST':
        await api.post(op.endpoint, op.body);
        break;
      case 'PATCH':
        await api.patch(op.endpoint, op.body);
        break;
      case 'PUT':
        await api.put(op.endpoint, op.body);
        break;
      case 'DELETE':
        await api.delete(op.endpoint);
        break;
    }
  }
}

export const offlineQueue = new OfflineQueue();
