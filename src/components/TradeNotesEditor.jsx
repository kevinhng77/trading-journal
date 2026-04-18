import { useCallback, useEffect, useState } from "react";
import { appendSpacedChunk } from "../lib/appendDictationChunk";
import { loadTradeNote, saveTradeNote } from "../storage/tradeNotes";
import NotesVoiceInputButton from "./NotesVoiceInputButton";

/**
 * @param {{ tradeId: string }} props
 */
export default function TradeNotesEditor({ tradeId }) {
  const [note, setNote] = useState(() => loadTradeNote(tradeId));

  useEffect(() => {
    const t = setTimeout(() => saveTradeNote(tradeId, note), 400);
    return () => clearTimeout(t);
  }, [note, tradeId]);

  const appendVoice = useCallback((chunk) => {
    setNote((cur) => appendSpacedChunk(cur, chunk));
  }, []);

  return (
    <>
      <textarea
        className="trade-detail-notes-input"
        placeholder="Click here to start typing your notes…"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={12}
      />
      <div className="trade-detail-notes-footer trade-detail-notes-footer--end">
        <NotesVoiceInputButton onAppend={appendVoice} />
      </div>
    </>
  );
}
