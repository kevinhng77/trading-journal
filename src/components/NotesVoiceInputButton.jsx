import { speechRecognitionAvailable, useSpeechDictation } from "../hooks/useSpeechDictation";

/**
 * @param {{ onAppend: (chunk: string) => void, className?: string }} props
 */
export default function NotesVoiceInputButton({ onAppend, className = "" }) {
  const { listening, error, toggle } = useSpeechDictation(onAppend);

  if (!speechRecognitionAvailable()) return null;

  return (
    <span className={`notes-voice-wrap ${className}`.trim()}>
      {error ? (
        <span className="notes-voice-error" role="status">
          {error}
        </span>
      ) : null}
      <button
        type="button"
        className={`notes-voice-btn${listening ? " is-listening" : ""}`}
        onClick={toggle}
        aria-pressed={listening}
        aria-label={listening ? "Stop voice dictation" : "Start voice dictation"}
        title={
          listening
            ? "Stop dictation (click again)"
            : "Voice to text — uses your microphone; speak in short phrases."
        }
      >
        <svg className="notes-voice-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden fill="currentColor">
          <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 1 1-10 0H5a7 7 0 0 0 6 6.92V20H9v2h6v-2h-2v-2.08A7 7 0 0 0 19 11h-2z" />
        </svg>
      </button>
    </span>
  );
}
