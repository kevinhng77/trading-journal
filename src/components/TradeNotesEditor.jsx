import { useEffect, useState } from "react";
import { pickRandomTradeNoteTemplate } from "../lib/tradeNoteTemplates";
import { loadTradeNote, saveTradeNote } from "../storage/tradeNotes";

export default function TradeNotesEditor({ tradeId }) {
  const [note, setNote] = useState(() => loadTradeNote(tradeId));

  useEffect(() => {
    const t = setTimeout(() => saveTradeNote(tradeId, note), 400);
    return () => clearTimeout(t);
  }, [note, tradeId]);

  function appendRandomTemplate() {
    setNote((cur) => `${cur}${pickRandomTradeNoteTemplate()}`);
  }

  return (
    <>
      <textarea
        className="trade-detail-notes-input"
        placeholder="Click here to start typing your notes…"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={8}
      />
      <div className="trade-detail-notes-footer trade-detail-notes-footer--end">
        <button type="button" className="journal-template-btn" onClick={appendRandomTemplate}>
          Random template
        </button>
      </div>
    </>
  );
}
