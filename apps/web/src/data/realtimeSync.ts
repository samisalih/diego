import { REALTIME_SUBSCRIBE_STATES, type RealtimePostgresChangesPayload, type SupabaseClient } from "@supabase/supabase-js";
import type { RowChange } from "./store.ts";
import type { TableChange } from "./sync.ts";
import type { DbRow } from "./mappers.ts";

export const SYNCED_TABLES = ["documents", "assets", "materials", "app_state"] as const;

export type RealtimeHandlers = {
  onChange: (change: TableChange) => void;
  /** Called on the first SUBSCRIBED and on every one after an error or close; the caller runs a full load. */
  onSubscribed: () => void;
};

function toRowChange(payload: RealtimePostgresChangesPayload<DbRow>): RowChange {
  return payload.eventType === "DELETE" ? { type: "delete", row: payload.old } : { type: "upsert", row: payload.new };
}

/** Subscribes one channel (unique topic per call, so remounts never share one) to all synced tables; returns the teardown. */
export function startRealtimeSync(client: SupabaseClient, handlers: RealtimeHandlers): () => void {
  const channel = client.channel(`scene-sync-${crypto.randomUUID()}`);
  for (const table of SYNCED_TABLES) {
    channel.on<DbRow>("postgres_changes", { event: "*", schema: "public", table }, (payload) =>
      handlers.onChange({ table, change: toRowChange(payload) }),
    );
  }
  channel.subscribe((status) => {
    if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) handlers.onSubscribed();
  });
  return () => {
    void client.removeChannel(channel);
  };
}
