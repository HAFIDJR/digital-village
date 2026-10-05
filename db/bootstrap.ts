import { runMigrations } from "./migrate";
import { seedDatabase } from "./seed";

type BootstrapState = {
  status: "pending" | "ready" | "failed";
  migrated: string[];
  seeded: boolean;
  error?: string;
  readyAt?: number;
};

interface BootstrapGlobal {
  __dvBootstrap?: Promise<BootstrapState>;
  __dvBootstrapState?: BootstrapState;
}

const globalForBootstrap = globalThis as unknown as BootstrapGlobal;

function setState(next: BootstrapState) {
  globalForBootstrap.__dvBootstrapState = next;
}

export function getBootstrapState(): BootstrapState {
  return globalForBootstrap.__dvBootstrapState ?? { status: "pending", migrated: [], seeded: false };
}

export function ensureDatabaseReady(): Promise<BootstrapState> {
  globalForBootstrap.__dvBootstrap ??= (async (): Promise<BootstrapState> => {
    try {
      const { applied } = await runMigrations();

      let seeded = false;
      if (process.env.DV_SKIP_AUTOSEED !== "1") {
        const result = await seedDatabase();
        seeded = !result.skipped;
      }

      const next: BootstrapState = {
        status: "ready",
        migrated: applied,
        seeded,
        readyAt: Date.now(),
      };
      setState(next);
      return next;
    } catch (error) {
      setState({
        status: "failed",
        migrated: [],
        seeded: false,
        error: error instanceof Error ? error.message : String(error),
      });
      // Surface the failure to the caller but allow a retry on the next request.
      globalForBootstrap.__dvBootstrap = undefined;
      throw error;
    }
  })();

  return globalForBootstrap.__dvBootstrap;
}