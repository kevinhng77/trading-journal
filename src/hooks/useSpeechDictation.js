import { useCallback, useEffect, useRef, useState } from "react";
import { releaseSpeechDictationLock, takeSpeechDictationLock } from "../lib/speechDictationLock";

function recognitionCtor() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function speechRecognitionAvailable() {
  return recognitionCtor() != null;
}

/**
 * Browser speech-to-text (Web Speech API). Appends finalized phrases via `onAppend`.
 * @param {(chunk: string) => void} onAppend
 */
export function useSpeechDictation(onAppend) {
  const onAppendRef = useRef(onAppend);

  const [listening, setListening] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const recRef = useRef(/** @type {any} */ (null));
  const stopLockRef = useRef(/** @type {(() => void) | null} */ (null));

  useEffect(() => {
    onAppendRef.current = onAppend;
  }, [onAppend]);

  const hardStop = useCallback(() => {
    const r = recRef.current;
    recRef.current = null;
    if (r) {
      try {
        r.abort();
      } catch {
        try {
          r.stop();
        } catch {
          /* ignore */
        }
      }
    }
    if (stopLockRef.current) {
      releaseSpeechDictationLock(stopLockRef.current);
      stopLockRef.current = null;
    }
    setListening(false);
  }, []);

  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor) {
      setError("Voice input is not supported in this browser.");
      return;
    }
    setError(null);
    hardStop();

    const r = new Ctor();
    r.continuous = true;
    r.interimResults = false;
    r.lang = "en-US";

    r.onresult = (event) => {
      let chunk = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        if (event.results[i].isFinal) chunk += event.results[i][0].transcript;
      }
      const t = chunk.trim();
      if (t) onAppendRef.current(t);
    };

    r.onerror = (e) => {
      if (e.error === "aborted" || e.error === "no-speech") return;
      setError(
        e.error === "not-allowed"
          ? "Microphone blocked — allow access for this site."
          : e.error === "network"
            ? "Speech service unreachable (check network)."
            : `Voice: ${e.error}`,
      );
    };

    const stopLock = () => {
      try {
        r.abort();
      } catch {
        try {
          r.stop();
        } catch {
          /* ignore */
        }
      }
    };
    stopLockRef.current = stopLock;
    takeSpeechDictationLock(stopLock);

    r.onend = () => {
      recRef.current = null;
      if (stopLockRef.current === stopLock) {
        releaseSpeechDictationLock(stopLock);
        stopLockRef.current = null;
      }
      setListening(false);
    };

    try {
      r.start();
      recRef.current = r;
      setListening(true);
    } catch {
      setError("Could not start voice input.");
      releaseSpeechDictationLock(stopLock);
      stopLockRef.current = null;
    }
  }, [hardStop]);

  const toggle = useCallback(() => {
    if (listening) hardStop();
    else start();
  }, [listening, hardStop, start]);

  useEffect(() => hardStop, [hardStop]);

  useEffect(() => {
    if (!error) return;
    const t = window.setTimeout(() => setError(null), 5000);
    return () => window.clearTimeout(t);
  }, [error]);

  return { listening, error, toggle, stop: hardStop };
}
