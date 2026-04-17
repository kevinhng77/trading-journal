import { useCallback, useMemo, useRef, useState } from "react";
import NotesVoiceInputButton from "../components/NotesVoiceInputButton";
import { appendSpacedChunk } from "../lib/appendDictationChunk";
import {
  createEmptyPlay,
  loadPlaybook,
  PLAYBOOK_MAX_SCREENSHOTS_PER_PLAY,
  savePlaybook,
} from "../storage/playbookStorage";

const MAX_SCREENSHOTS = PLAYBOOK_MAX_SCREENSHOTS_PER_PLAY;
const MAX_IMAGE_WIDTH = 1400;
const JPEG_QUALITY = 0.82;

/** @param {File} file */
function compressImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result;
      if (typeof url !== "string") {
        reject(new Error("read"));
        return;
      }
      const img = new Image();
      img.onload = () => {
        try {
          let w = img.width;
          let h = img.height;
          if (w < 1 || h < 1) {
            reject(new Error("size"));
            return;
          }
          if (w > MAX_IMAGE_WIDTH) {
            const scale = MAX_IMAGE_WIDTH / w;
            w = Math.max(1, Math.round(w * scale));
            h = Math.max(1, Math.round(h * scale));
          }
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve(url);
            return;
          }
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/jpeg", JPEG_QUALITY));
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = () => reject(new Error("decode"));
      img.src = url;
    };
    reader.onerror = () => reject(reader.error || new Error("read"));
    reader.readAsDataURL(file);
  });
}

function rulesPreviewLines(text) {
  return text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** @param {DataTransfer | null} dt */
function imageFilesFromDataTransfer(dt) {
  if (!dt?.files?.length) return [];
  return [...dt.files].filter((f) => f.type.startsWith("image/"));
}

/** @param {ClipboardData | null} cd */
function imageFilesFromClipboard(cd) {
  if (!cd) return [];
  const out = [];
  if (cd.files?.length) {
    for (let i = 0; i < cd.files.length; i++) {
      const f = cd.files[i];
      if (f.type.startsWith("image/")) out.push(f);
    }
  }
  if (!out.length && cd.items) {
    for (let i = 0; i < cd.items.length; i++) {
      const item = cd.items[i];
      if (item.kind === "file" && item.type.startsWith("image/")) {
        const f = item.getAsFile();
        if (f) out.push(f);
      }
    }
  }
  return out;
}

export default function Playbook() {
  const [plays, setPlays] = useState(loadPlaybook);
  const [selectedId, setSelectedId] = useState(() => loadPlaybook()[0]?.id ?? null);
  const [saveError, setSaveError] = useState(null);
  const [imageError, setImageError] = useState(null);
  const [shotDropActive, setShotDropActive] = useState(false);
  const fileInputRef = useRef(null);
  const shotDragDepthRef = useRef(0);

  const applyPlays = useCallback((next) => {
    const r = savePlaybook(next);
    if (!r.ok) {
      setSaveError(r.message);
      return false;
    }
    setSaveError(null);
    setPlays(next);
    return true;
  }, []);

  const appendPlayVoiceField = useCallback((playId, field, chunk) => {
    const t = String(chunk ?? "").trim();
    if (!t) return;
    setPlays((currentPlays) => {
      const next = currentPlays.map((p) => {
        if (p.id !== playId) return p;
        const merged = appendSpacedChunk(String(p[field] ?? ""), t);
        return { ...p, [field]: merged };
      });
      const r = savePlaybook(next);
      if (!r.ok) {
        setSaveError(r.message);
        return currentPlays;
      }
      setSaveError(null);
      return next;
    });
  }, []);

  const resolvedSelectedId = useMemo(() => {
    if (!plays.length) return null;
    if (selectedId != null && plays.some((p) => p.id === selectedId)) return selectedId;
    return plays[0].id;
  }, [plays, selectedId]);

  const selectedPlay = useMemo(
    () =>
      resolvedSelectedId ? (plays.find((p) => p.id === resolvedSelectedId) ?? null) : null,
    [plays, resolvedSelectedId],
  );

  function addPlay() {
    const p = createEmptyPlay();
    const next = [p, ...plays];
    if (applyPlays(next)) setSelectedId(p.id);
  }

  function deletePlay(id) {
    if (!window.confirm("Delete this play from your playbook?")) return;
    const next = plays.filter((p) => p.id !== id);
    applyPlays(next);
  }

  /** @param {string} id @param {Record<string, unknown>} patch */
  function patchPlay(id, patch) {
    const next = plays.map((p) => (p.id === id ? { ...p, ...patch } : p));
    applyPlays(next);
  }

  /** @param {import("../storage/playbookStorage").PlaybookPlay} play @param {File[]} files */
  async function appendImagesFromFiles(play, files) {
    setImageError(null);
    const imageFiles = files.filter((f) => f.type.startsWith("image/"));
    if (!imageFiles.length) {
      if (files.length > 0) setImageError("Those files are not images. Use PNG, JPEG, GIF, or WebP.");
      return;
    }

    const room = MAX_SCREENSHOTS - play.screenshots.length;
    if (room <= 0) {
      setImageError(`You can attach up to ${MAX_SCREENSHOTS} screenshots per play.`);
      return;
    }

    const slice = imageFiles.slice(0, room);
    const additions = [];
    for (const file of slice) {
      try {
        const dataUrl = await compressImageFile(file);
        additions.push({
          id:
            typeof crypto !== "undefined" && crypto.randomUUID
              ? crypto.randomUUID()
              : `shot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          dataUrl,
        });
      } catch {
        setImageError("Could not read one of the images. Try PNG or JPEG.");
      }
    }
    if (!additions.length) return;

    const merged = [...play.screenshots, ...additions];
    const next = plays.map((p) => (p.id === play.id ? { ...p, screenshots: merged } : p));
    if (!applyPlays(next) && additions.length) {
      setImageError("Save failed (storage may be full). Remove images and try again.");
    }
  }

  async function onImagePick(e) {
    if (!selectedPlay) return;
    const input = e.target;
    const files = input.files ? [...input.files] : [];
    input.value = "";
    await appendImagesFromFiles(selectedPlay, files);
  }

  /** @param {import("react").ClipboardEvent<HTMLTextAreaElement>} e */
  async function onScreenshotPaste(e) {
    if (!selectedPlay) return;
    const files = imageFilesFromClipboard(e.clipboardData);
    if (!files.length) return;
    e.preventDefault();
    await appendImagesFromFiles(selectedPlay, files);
  }

  /** @param {import("react").DragEvent<HTMLTextAreaElement>} e */
  function onScreenshotDragEnter(e) {
    e.preventDefault();
    e.stopPropagation();
    shotDragDepthRef.current += 1;
    setShotDropActive(true);
  }

  /** @param {import("react").DragEvent<HTMLTextAreaElement>} e */
  function onScreenshotDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  }

  /** @param {import("react").DragEvent<HTMLTextAreaElement>} e */
  function onScreenshotDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    shotDragDepthRef.current = Math.max(0, shotDragDepthRef.current - 1);
    if (shotDragDepthRef.current === 0) setShotDropActive(false);
  }

  /** @param {import("react").DragEvent<HTMLTextAreaElement>} e */
  async function onScreenshotDrop(e) {
    if (!selectedPlay) return;
    e.preventDefault();
    e.stopPropagation();
    shotDragDepthRef.current = 0;
    setShotDropActive(false);
    const files = imageFilesFromDataTransfer(e.dataTransfer);
    await appendImagesFromFiles(selectedPlay, files);
  }

  function removeScreenshot(playId, shotId) {
    const play = plays.find((p) => p.id === playId);
    if (!play) return;
    const nextShots = play.screenshots.filter((s) => s.id !== shotId);
    patchPlay(playId, { screenshots: nextShots });
  }

  const previewLines = selectedPlay ? rulesPreviewLines(selectedPlay.rules) : [];

  return (
    <div className="page-wrap playbook-page">
      <div className="page-header playbook-page-header">
        <div>
          <h1>Playbook</h1>
          <p className="playbook-intro">
            Document setups: rules, criteria, entries, exits, R multiples, and chart screenshots. Everything is stored
            in this browser only.
          </p>
        </div>
        <button type="button" className="import-btn playbook-header-btn" onClick={addPlay}>
          New play
        </button>
      </div>

      {saveError && (
        <div className="card playbook-banner playbook-banner--error" role="alert">
          {saveError}
        </div>
      )}

      <div className="playbook-layout">
        <aside className="card playbook-list-card" aria-label="Plays">
          <div className="playbook-list-head">
            <h2 className="playbook-list-title">Plays</h2>
            <span className="playbook-list-count">{plays.length}</span>
          </div>
          {plays.length === 0 ? (
            <p className="playbook-list-empty">No plays yet. Use &quot;New play&quot; to add one.</p>
          ) : (
            <ul className="playbook-list">
              {plays.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className={`playbook-list-item ${p.id === resolvedSelectedId ? "playbook-list-item--active" : ""}`}
                    onClick={() => setSelectedId(p.id)}
                  >
                    <span className="playbook-list-item-name">{p.name || "Untitled"}</span>
                    {p.screenshots.length > 0 && (
                      <span className="playbook-list-item-meta">{p.screenshots.length} img</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="playbook-editor">
          {!selectedPlay ? (
            <div className="card playbook-empty-editor">
              <p>Create a play to start documenting rules, entries, and screenshots.</p>
            </div>
          ) : (
            <div className="card playbook-form-card">
              <div className="playbook-form-head">
                <label className="playbook-field playbook-field--grow">
                  <span className="playbook-field-label">Play name</span>
                  <input
                    type="text"
                    className="playbook-input"
                    value={selectedPlay.name}
                    onChange={(e) => patchPlay(selectedPlay.id, { name: e.target.value })}
                    autoComplete="off"
                  />
                </label>
                <button
                  type="button"
                  className="playbook-delete-btn"
                  onClick={() => deletePlay(selectedPlay.id)}
                >
                  Delete play
                </button>
              </div>

              <div className="playbook-field-grid">
                <label className="playbook-field playbook-field--full">
                  <span className="playbook-field-label-row">
                    <span className="playbook-field-label">Rules (one per line)</span>
                    <NotesVoiceInputButton onAppend={(c) => appendPlayVoiceField(selectedPlay.id, "rules", c)} />
                  </span>
                  <textarea
                    className="playbook-textarea"
                    rows={5}
                    value={selectedPlay.rules}
                    onChange={(e) => patchPlay(selectedPlay.id, { rules: e.target.value })}
                    placeholder="e.g. Only trade first hour&#10;Max 2 trades per day"
                  />
                </label>
                {previewLines.length > 0 && (
                  <div className="playbook-rules-preview playbook-field--full">
                    <span className="playbook-field-label">Preview</span>
                    <ol className="playbook-rules-ol">
                      {previewLines.map((line, i) => (
                        <li key={i}>{line}</li>
                      ))}
                    </ol>
                  </div>
                )}

                <label className="playbook-field">
                  <span className="playbook-field-label-row">
                    <span className="playbook-field-label">Criteria</span>
                    <NotesVoiceInputButton onAppend={(c) => appendPlayVoiceField(selectedPlay.id, "criteria", c)} />
                  </span>
                  <textarea
                    className="playbook-textarea"
                    rows={4}
                    value={selectedPlay.criteria}
                    onChange={(e) => patchPlay(selectedPlay.id, { criteria: e.target.value })}
                    placeholder="Market structure, levels, indicators, news filter…"
                  />
                </label>

                <label className="playbook-field">
                  <span className="playbook-field-label-row">
                    <span className="playbook-field-label">R (plan)</span>
                    <NotesVoiceInputButton onAppend={(c) => appendPlayVoiceField(selectedPlay.id, "rPlan", c)} />
                  </span>
                  <textarea
                    className="playbook-textarea playbook-textarea--short"
                    rows={3}
                    value={selectedPlay.rPlan}
                    onChange={(e) => patchPlay(selectedPlay.id, { rPlan: e.target.value })}
                    placeholder="e.g. 2R target, stop at -1R (structure invalidation)"
                  />
                </label>

                <label className="playbook-field playbook-field--full">
                  <span className="playbook-field-label-row">
                    <span className="playbook-field-label">Entry</span>
                    <NotesVoiceInputButton onAppend={(c) => appendPlayVoiceField(selectedPlay.id, "entry", c)} />
                  </span>
                  <textarea
                    className="playbook-textarea"
                    rows={4}
                    value={selectedPlay.entry}
                    onChange={(e) => patchPlay(selectedPlay.id, { entry: e.target.value })}
                    placeholder="Trigger, order type, location…"
                  />
                </label>

                <label className="playbook-field playbook-field--full">
                  <span className="playbook-field-label-row">
                    <span className="playbook-field-label">Exit</span>
                    <NotesVoiceInputButton onAppend={(c) => appendPlayVoiceField(selectedPlay.id, "exit", c)} />
                  </span>
                  <textarea
                    className="playbook-textarea"
                    rows={4}
                    value={selectedPlay.exit}
                    onChange={(e) => patchPlay(selectedPlay.id, { exit: e.target.value })}
                    placeholder="Targets, time stop, scale-out rules…"
                  />
                </label>
              </div>

              <div className="playbook-shots">
                <div className="playbook-shots-head">
                  <h3 className="playbook-section-title">Screenshots</h3>
                  <button
                    type="button"
                    className="range-btn"
                    disabled={selectedPlay.screenshots.length >= MAX_SCREENSHOTS}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Add images
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="playbook-file-input"
                    onChange={onImagePick}
                  />
                </div>
                <p className="playbook-shots-hint">
                  Up to {MAX_SCREENSHOTS} images per play. Drop files or paste (Ctrl+V) into the box below, or use Add
                  images. Large files are resized to save browser storage.
                </p>
                {imageError && <p className="playbook-image-error">{imageError}</p>}
                <textarea
                  readOnly
                  tabIndex={0}
                  className={`playbook-shot-dropzone ${shotDropActive ? "playbook-shot-dropzone--active" : ""}`}
                  value=""
                  placeholder={
                    selectedPlay.screenshots.length >= MAX_SCREENSHOTS
                      ? "Screenshot limit reached — remove one to add more."
                      : "Drop image files here, or focus this box and press Ctrl+V to paste a screenshot from the clipboard…"
                  }
                  aria-label="Screenshot drop and paste area"
                  disabled={selectedPlay.screenshots.length >= MAX_SCREENSHOTS}
                  onPaste={onScreenshotPaste}
                  onDragEnter={onScreenshotDragEnter}
                  onDragOver={onScreenshotDragOver}
                  onDragLeave={onScreenshotDragLeave}
                  onDrop={onScreenshotDrop}
                />
                {selectedPlay.screenshots.length > 0 ? (
                  <div className="playbook-shot-grid">
                    {selectedPlay.screenshots.map((shot) => (
                      <figure key={shot.id} className="playbook-shot">
                        <a href={shot.dataUrl} target="_blank" rel="noreferrer" className="playbook-shot-link">
                          <img src={shot.dataUrl} alt="" className="playbook-shot-img" loading="lazy" />
                        </a>
                        <figcaption className="playbook-shot-cap">
                          <button
                            type="button"
                            className="playbook-shot-remove"
                            onClick={() => removeScreenshot(selectedPlay.id, shot.id)}
                          >
                            Remove
                          </button>
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                ) : (
                  <p className="playbook-shots-empty">Thumbnails appear here after you add images.</p>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
