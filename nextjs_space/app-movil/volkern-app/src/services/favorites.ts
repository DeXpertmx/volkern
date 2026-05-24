import * as SecureStore from 'expo-secure-store';

// ─── Types ────────────────────────────────────────────────────────────────────
export type FavoriteType = 'module' | 'task';

export interface FavoriteItem {
  id: string;
  type: FavoriteType;
  name: string;
  icon: string;
  color: string;
  addedAt: number;
}

// ─── Keys ─────────────────────────────────────────────────────────────────────
const FAVORITES_KEY = 'volkern_favorites';

// ─── Service ──────────────────────────────────────────────────────────────────
class FavoritesService {
  /**
   * Get all favorites (sorted by most recently added first).
   */
  async getAll(): Promise<FavoriteItem[]> {
    try {
      const raw = await SecureStore.getItemAsync(FAVORITES_KEY);
      if (raw) {
        const items = JSON.parse(raw) as FavoriteItem[];
        return items.sort((a, b) => b.addedAt - a.addedAt);
      }
    } catch {
      // ignore parse errors
    }
    return [];
  }

  /**
   * Get favorites of a specific type.
   */
  async getByType(type: FavoriteType): Promise<FavoriteItem[]> {
    const all = await this.getAll();
    return all.filter((f) => f.type === type);
  }

  /**
   * Add an item to favorites.
   */
  async add(item: Omit<FavoriteItem, 'addedAt'>): Promise<void> {
    const all = await this.getAll();
    // Don't add if already favorited
    if (all.some((f) => f.id === item.id && f.type === item.type)) return;
    all.unshift({ ...item, addedAt: Date.now() });
    await this.persist(all);
  }

  /**
   * Remove an item from favorites.
   */
  async remove(id: string, type: FavoriteType): Promise<void> {
    const all = await this.getAll();
    const filtered = all.filter((f) => !(f.id === id && f.type === type));
    await this.persist(filtered);
  }

  /**
   * Toggle favorite status. Returns true if now favorited, false if removed.
   */
  async toggle(item: Omit<FavoriteItem, 'addedAt'>): Promise<boolean> {
    const all = await this.getAll();
    const existing = all.find((f) => f.id === item.id && f.type === item.type);
    if (existing) {
      await this.remove(item.id, item.type);
      return false;
    } else {
      await this.add(item);
      return true;
    }
  }

  /**
   * Check if an item is favorited.
   */
  async isFavorite(id: string, type: FavoriteType): Promise<boolean> {
    const all = await this.getAll();
    return all.some((f) => f.id === id && f.type === type);
  }

  /**
   * Check if multiple items of a type are favorited (batch check).
   * Returns a Set of favorited IDs.
   */
  async getFavoritedIds(type: FavoriteType): Promise<Set<string>> {
    const all = await this.getAll();
    return new Set(all.filter((f) => f.type === type).map((f) => f.id));
  }

  /**
   * Remove all favorites of a given type.
   */
  async clearByType(type: FavoriteType): Promise<void> {
    const all = await this.getAll();
    const filtered = all.filter((f) => f.type !== type);
    await this.persist(filtered);
  }

  /**
   * Remove all favorites.
   */
  async clearAll(): Promise<void> {
    await this.persist([]);
  }

  /**
   * Get the total count of favorites.
   */
  async count(): Promise<number> {
    const all = await this.getAll();
    return all.length;
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private async persist(items: FavoriteItem[]): Promise<void> {
    try {
      await SecureStore.setItemAsync(FAVORITES_KEY, JSON.stringify(items));
    } catch {
      console.error('[FavoritesService] Error saving favorites');
    }
  }
}

export const favoritesService = new FavoritesService();
