import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

// ─── Types ────────────────────────────────────────────────────────────────────
export type NetworkStatus = 'online' | 'offline' | 'wifi' | 'cellular' | 'unknown';

export interface NetworkState {
  isConnected: boolean;
  status: NetworkStatus;
  isInternetReachable: boolean | null;
  details: string | null;
}

// ─── Service ──────────────────────────────────────────────────────────────────
class NetworkService {
  private listeners: Array<(state: NetworkState) => void> = [];
  private currentState: NetworkState = {
    isConnected: true,
    status: 'unknown',
    isInternetReachable: true,
    details: null,
  };
  private unsubscribe: (() => void) | null = null;

  /**
   * Inicia el monitoreo de red.
   * Llama al callback inmediatamente con el estado actual y luego en cada cambio.
   */
  startMonitoring(onChange?: (state: NetworkState) => void): () => void {
    if (onChange) {
      this.listeners.push(onChange);
    }

    if (!this.unsubscribe) {
      this.unsubscribe = NetInfo.addEventListener((netState: NetInfoState) => {
        this.currentState = this.mapState(netState);
        this.notifyListeners();
      });
    }

    // Obtener estado inicial
    NetInfo.fetch().then((netState) => {
      this.currentState = this.mapState(netState);
      this.notifyListeners();
    });

    return () => this.stopMonitoring(onChange);
  }

  /**
   * Deja de monitorear. Si se pasa un callback específico, solo lo remueve a él.
   */
  stopMonitoring(listener?: (state: NetworkState) => void): void {
    if (listener) {
      this.listeners = this.listeners.filter((l) => l !== listener);
    }
    if (this.listeners.length === 0 && this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  /**
   * Obtiene el estado actual de la red (síncrono).
   */
  getCurrentState(): NetworkState {
    return { ...this.currentState };
  }

  /**
   * Verifica si hay conexión (conveniencia).
   */
  isOnline(): boolean {
    return this.currentState.isConnected && this.currentState.isInternetReachable !== false;
  }

  /**
   * Suscribe un listener a cambios de red. Retorna función para desuscribirse.
   */
  subscribe(listener: (state: NetworkState) => void): () => void {
    this.listeners.push(listener);
    // Llamar inmediatamente con el estado actual
    listener({ ...this.currentState });
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  // ─── Private ────────────────────────────────────────────────────────────────
  private mapState(netState: NetInfoState): NetworkState {
    let status: NetworkStatus = 'unknown';
    if (netState.isConnected) {
      if (netState.type === 'wifi') status = 'wifi';
      else if (netState.type === 'cellular') status = 'cellular';
      else status = 'online';
    } else {
      status = 'offline';
    }

    return {
      isConnected: netState.isConnected ?? false,
      status,
      isInternetReachable: netState.isInternetReachable,
      details: netState.isConnected
        ? netState.type === 'wifi'
          ? 'Wi-Fi'
          : netState.type === 'cellular'
            ? 'Datos móviles'
            : 'Ethernet'
        : 'Sin conexión',
    };
  }

  private notifyListeners(): void {
    const state = { ...this.currentState };
    this.listeners.forEach((listener) => {
      try {
        listener(state);
      } catch (e) {
        console.error('[NetworkService] Error in listener:', e);
      }
    });
  }
}

export const networkService = new NetworkService();
