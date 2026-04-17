import { useCallback, useEffect, useMemo, useState } from "react";
import { appendSpacedChunk } from "../lib/appendDictationChunk";
import { loadTradeNote, saveTradeNote } from "../storage/tradeNotes";
import NotesVoiceInputButton from "./NotesVoiceInputButton";

/**
 * @param {{
 *   tradeId: string,
 *   numberedMarkerCount?: number,
 *   annotationNotes?: string[],
 *   onAnnotationNotesChange?: (rows: string[]) => void,
 * }} props
 */
export default function TradeNotesEditor({
  tradeId,
  numberedMarkerCount = 0,
  annotationNotes = [],
  onAnnotationNotesChange,
}) {
  const [note, setNote] = useState(() => loadTradeNote(tradeId));

  useEffect(() => {
    const t = setTimeout(() => saveTradeNote(tradeId, note), 400);
    return () => clearTimeout(t);
  }, [note, tradeId]);

  const appendVoice = useCallback((chunk) => {
    setNote((cur) => appendSpacedChunk(cur, chunk));
  }, []);

  const displayAnnotationRows = useMemo(
    () => Array.from({ length: numberedMarkerCount }, (_, i) => annotationNotes[i] ?? ""),
    [numberedMarkerCount, annotationNotes],
  );

  const appendAnnotationVoice = useCallback(
    (rowIndex, chunk) => {
      if (!onAnnotationNotesChange) return;
      const next = Array.from({ length: numberedMarkerCount }, (_, j) =>
        j === rowIndex ? appendSpacedChunk(annotationNotes[j] ?? "", chunk) : annotationNotes[j] ?? "",
      );
      onAnnotationNotesChange(next);
    },
    [annotationNotes, onAnnotationNotesChange, numberedMarkerCount],
  );

  return (
    <>
      <textarea
        className="trade-detail-notes-input"
        placeholder="Click here to start typing your notes…"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={8}
      />
      {numberedMarkerCount > 0 && onAnnotationNotesChange ? (
        <div className="trade-detail-annotation-block">
          <ul className="trade-detail-annotation-list">
            {displayAnnotationRows.map((rowText, i) => (
              <li key={i} className="trade-detail-annotation-row">
                <span className="trade-detail-annotation-num">{i + 1}.</span>
                <textarea
                  className="trade-detail-annotation-input"
                  rows={1}
                  value={rowText}
                  onChange={(e) => {
                    const v = e.target.value;
                    const next = Array.from({ length: numberedMarkerCount }, (_, j) =>
                      j === i ? v : annotationNotes[j] ?? "",
                    );
                    onAnnotationNotesChange(next);
                  }}
                  placeholder={`Note for chart #${i + 1}…`}
                  aria-label={`Notes for chart marker ${i + 1}`}
                />
                <NotesVoiceInputButton onAppend={(c) => appendAnnotationVoice(i, c)} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="trade-detail-notes-footer trade-detail-notes-footer--end">
        <NotesVoiceInputButton onAppend={appendVoice} />
      </div>
    </>
  );
}
