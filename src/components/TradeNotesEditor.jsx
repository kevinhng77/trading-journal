import { useCallback, useEffect, useMemo, useState } from "react";
import { appendSpacedChunk } from "../lib/appendDictationChunk";
import { pickRandomTradeNoteTemplate } from "../lib/tradeNoteTemplates";
import { loadTradeNote, saveTradeNote } from "../storage/tradeNotes";
import NotesVoiceInputButton from "./NotesVoiceInputButton";

/**
 * @param {{
 *   tradeId: string,
 *   trendlineCount?: number,
 *   annotationNotes?: string[],
 *   onAnnotationNotesChange?: (rows: string[]) => void,
 * }} props
 */
export default function TradeNotesEditor({
  tradeId,
  trendlineCount = 0,
  annotationNotes = [],
  onAnnotationNotesChange,
}) {
  const [note, setNote] = useState(() => loadTradeNote(tradeId));

  useEffect(() => {
    const t = setTimeout(() => saveTradeNote(tradeId, note), 400);
    return () => clearTimeout(t);
  }, [note, tradeId]);

  function appendRandomTemplate() {
    setNote((cur) => `${cur}${pickRandomTradeNoteTemplate()}`);
  }

  const appendVoice = useCallback((chunk) => {
    setNote((cur) => appendSpacedChunk(cur, chunk));
  }, []);

  const displayAnnotationRows = useMemo(
    () => Array.from({ length: trendlineCount }, (_, i) => annotationNotes[i] ?? ""),
    [trendlineCount, annotationNotes],
  );

  const appendAnnotationVoice = useCallback(
    (rowIndex, chunk) => {
      if (!onAnnotationNotesChange) return;
      const next = Array.from({ length: trendlineCount }, (_, j) =>
        j === rowIndex ? appendSpacedChunk(annotationNotes[j] ?? "", chunk) : annotationNotes[j] ?? "",
      );
      onAnnotationNotesChange(next);
    },
    [annotationNotes, onAnnotationNotesChange, trendlineCount],
  );

  function applyAnnotationTemplate() {
    if (!onAnnotationNotesChange || trendlineCount <= 0) return;
    onAnnotationNotesChange(Array(trendlineCount).fill(""));
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
      {trendlineCount > 0 && onAnnotationNotesChange ? (
        <div className="trade-detail-annotation-block">
          <div className="trade-detail-annotation-head">
            <span className="trade-detail-annotation-title">Per-arrow notes</span>
            <button
              type="button"
              className="journal-template-btn"
              onClick={applyAnnotationTemplate}
              title={`Create ${trendlineCount} numbered rows (1. … ${trendlineCount}.) with voice buttons — clears existing text in those rows.`}
            >
              Annotation template
            </button>
          </div>
          <p className="trade-detail-annotation-hint">
            Matches the numbered trendlines on your chart. Use the mic on each row to dictate what that arrow marks.
          </p>
          <ul className="trade-detail-annotation-list">
            {displayAnnotationRows.map((rowText, i) => (
              <li key={i} className="trade-detail-annotation-row">
                <span className="trade-detail-annotation-num">{i + 1}.</span>
                <textarea
                  className="trade-detail-annotation-input"
                  rows={2}
                  value={rowText}
                  onChange={(e) => {
                    const v = e.target.value;
                    const next = Array.from({ length: trendlineCount }, (_, j) =>
                      j === i ? v : annotationNotes[j] ?? "",
                    );
                    onAnnotationNotesChange(next);
                  }}
                  placeholder={`Notes for arrow ${i + 1}…`}
                  aria-label={`Notes for trendline ${i + 1}`}
                />
                <NotesVoiceInputButton onAppend={(c) => appendAnnotationVoice(i, c)} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="trade-detail-notes-footer trade-detail-notes-footer--end">
        <NotesVoiceInputButton onAppend={appendVoice} />
        <button type="button" className="journal-template-btn" onClick={appendRandomTemplate}>
          Random template
        </button>
      </div>
    </>
  );
}
