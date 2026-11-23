import { useCallback, useEffect, useRef, useState } from "react";

type SpeechAlternative = { transcript: string; confidence: number };
type SpeechResult = {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechAlternative;
};
type SpeechResultList = {
  length: number;
  [index: number]: SpeechResult;
};
type SpeechResultEvent = { resultIndex: number; results: SpeechResultList };
type SpeechErrorEvent = { error: string; message?: string };
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: SpeechErrorEvent) => void) | null;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;
type SpeechWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

function describeSpeechError(error: string): string {
  if (error === "not-allowed" || error === "service-not-allowed") {
    return "Microphone permission was denied. Allow microphone access or type your update instead.";
  }
  if (error === "no-speech") {
    return "No speech was detected. Try again or type your update instead.";
  }
  if (error === "audio-capture") {
    return "No microphone was found. You can type your update instead.";
  }
  return `Speech recognition stopped (${error}). You can type your update instead.`;
}

function getRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const speechWindow = window as SpeechWindow;
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

export function isSpeechRecognitionSupported(): boolean {
  return getRecognitionConstructor() !== null;
}

export function useSpeechRecognition({
  lang = "en-US",
  onFinal,
}: {
  lang?: string;
  onFinal: (text: string) => void;
}) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const onFinalRef = useRef(onFinal);

  useEffect(() => {
    onFinalRef.current = onFinal;
  }, [onFinal]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    };
  }, []);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setListening(false);
    setInterim("");
  }, []);

  const start = useCallback(() => {
    setError("");
    if (recognitionRef.current) return;

    const Recognition = getRecognitionConstructor();
    if (!Recognition) {
      setError("Speech recognition is not supported in this browser. Type your update instead.");
      return;
    }

    const recognition = new Recognition();
    recognition.lang = lang;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setListening(true);
    recognition.onresult = (event) => {
      let finalChunk = "";
      let interimChunk = "";

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result[0]?.transcript ?? "";
        if (result.isFinal) finalChunk += transcript;
        else interimChunk += transcript;
      }

      const spoken = finalChunk.trim();
      if (spoken) onFinalRef.current(spoken);
      setInterim(interimChunk.trim());
    };
    recognition.onerror = (event) => {
      setError(describeSpeechError(event.error));
      setListening(false);
      setInterim("");
    };
    recognition.onend = () => {
      setListening(false);
      setInterim("");
      if (recognitionRef.current === recognition) recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setError("Could not start the microphone. You can type your update instead.");
      setListening(false);
    }
  }, [lang]);

  const clearError = useCallback(() => setError(""), []);

  return {
    listening,
    interim,
    error,
    start,
    stop,
    clearError,
  };
}
