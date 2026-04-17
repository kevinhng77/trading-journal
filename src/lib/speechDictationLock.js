/** @type {null | (() => void)} */
let stopActiveDictation = null;

/** Stop any other in-app dictation session, then register this one. */
export function takeSpeechDictationLock(stopFn) {
  if (typeof stopFn !== "function") return;
  if (stopActiveDictation) stopActiveDictation();
  stopActiveDictation = stopFn;
}

/** @param {() => void} stopFn */
export function releaseSpeechDictationLock(stopFn) {
  if (stopActiveDictation === stopFn) stopActiveDictation = null;
}
