import { REALTIME_SUBSCRIBE_STATES, type RealtimePostgresChangesPayload, type SupabaseClient } from "@supabase/supabase-js";
import type { RowChange } from "./store.ts";
import type { DbRow } from "./mappers.ts";

export const SYNCED_TABLES = ["documents", "assets", "materials", "app_state"] as const;
export type SyncedTable = (typeof SYNCED_TABLES)[number];

export type RealtimeHandlers = {
  onChange: (table: SyncedTable, change: RowChange) => void;
  /** Called when the channel is live again after an error or close; the caller reloads everything. */
  onReconnect: () => void;
};

function toRowChange(payload: RealtimePostgresChangesPayload<DbRow>): RowChange {
  return payload.eventType === "DELETE" ? { type: "delete", row: payload.old } : { type: "upsert", row: payload.new };
}

const isFailureState = (status: REALTIME_SUBSCRIBE_STATES): boolean =>
  status === REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR ||
  status === REALTIME_SUBSCRIBE_STATES.TIMED_OUT ||
  status === REALTIME_SUBSCRIBE_STATES.CLOSED;

/** Subscribes one channel to all synced tables; returns the function that tears it down. */
export function startRealtimeSync(client: SupabaseClient, handlers: RealtimeHandlers): () => void {
  let hasFailed = false;
  const channel = client.channel("scene-sync");
  for (const table of SYNCED_TABLES) {
    channel.on<DbRow>("postgres_changes", { event: "*", schema: "public", table }, (payload) =>
      handlers.onChange(table, toRowChange(payload)),
    );
  }
  channel.subscribe((status) => {
    if (isFailureState(status)) hasFailed = true;
    else if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED && hasFailed) {
      hasFailed = false;
      handlers.onReconnect();
    }
  });
  return () => {
    void client.removeChannel(channel);
  };
}
