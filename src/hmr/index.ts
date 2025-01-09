type AcceptCallback = (newModule?: any) => void;
type DisposeCallback = () => void;

interface HotContext {
  file: string;
  accept(callback: AcceptCallback): void;
  dispose(callback: DisposeCallback): void;
  triggerUpdate(newModule?: any): void;
}

export function createFashHotContext(file: string): HotContext {
  const listeners = {
    accept: [] as AcceptCallback[],
    dispose: [] as DisposeCallback[],
  };

  const hotContext: HotContext = {
    file,

    // Registers a callback to handle module updates
    accept(callback: AcceptCallback) {
      if (typeof callback === "function") {
        listeners.accept.push(callback);
      } else {
        console.warn(`[HMR] No valid accept handler for ${file}`);
      }
    },

    // Registers a callback to handle cleanup before a module is replaced
    dispose(callback: DisposeCallback) {
      if (typeof callback === "function") {
        listeners.dispose.push(callback);
      } else {
        console.warn(`[HMR] No valid dispose handler for ${file}`);
      }
    },

    // Called when the module is being replaced
    triggerUpdate(newModule?: any) {
      console.log(`[HMR] Updating ${file}`);
      listeners.dispose.forEach((callback) => callback());
      listeners.accept.forEach((callback) => callback(newModule));
    },
  };

  return hotContext;
}
