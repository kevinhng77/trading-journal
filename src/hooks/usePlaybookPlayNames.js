import { useEffect, useMemo, useState } from "react";
import { loadPlaybook, PLAYBOOK_CHANGED_EVENT, PLAYBOOK_STORAGE_KEY } from "../storage/playbookStorage";

/** Play names from the saved playbook; updates when playbook saves (same tab) or storage syncs (other tab). */
export function usePlaybookPlayNames() {
  const [rev, setRev] = useState(0);

  useEffect(() => {
    const bump = () => setRev((r) => r + 1);
    window.addEventListener(PLAYBOOK_CHANGED_EVENT, bump);
    const onStorage = (/** @type {StorageEvent} */ e) => {
      if (e.key === PLAYBOOK_STORAGE_KEY || e.key === null) bump();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(PLAYBOOK_CHANGED_EVENT, bump);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return useMemo(() => {
    void rev;
    return loadPlaybook()
      .map((p) => (typeof p.name === "string" ? p.name.trim() : ""))
      .filter((n) => n.length > 0);
  }, [rev]);
}
