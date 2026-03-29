import { useEffect, useMemo, useRef, useState } from "react";

export default function InputBox({
  value,
  loading,
  disabled,
  onChange,
  onSend,
  onTyping,
  onAnalyzeDocument,
  placeholder,
}) {
  const inputRef = useRef(null);
  const recognitionRef = useRef(null);
  const liveTranscriptRef = useRef("");
  const onChangeRef = useRef(onChange);
  const onSendRef = useRef(onSend);
  const onTypingRef = useRef(onTyping);
  const disabledRef = useRef(disabled);
  const loadingRef = useRef(loading);
  const [isListening, setIsListening] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const fileInputRef = useRef(null);
  const hasText = useMemo(() => value.trim().length > 0, [value]);
  const canSend = useMemo(() => hasText && !loading && !disabled, [hasText, loading, disabled]);

  useEffect(() => {
    if (!inputRef.current) return;
    inputRef.current.style.height = "auto";
    inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 160)}px`;
  }, [value]);

  useEffect(() => {
    if (!disabled && inputRef.current) {
      inputRef.current.focus();
    }
  }, [disabled]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onSendRef.current = onSend;
  }, [onSend]);

  useEffect(() => {
    onTypingRef.current = onTyping;
  }, [onTyping]);

  useEffect(() => {
    disabledRef.current = disabled;
  }, [disabled]);

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSpeechSupported(false);
      return;
    }

    setSpeechSupported(true);
    const recognition = new SpeechRecognition();
    recognition.lang = "en-IN";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      liveTranscriptRef.current = "";
    };

    recognition.onresult = (event) => {
      let partial = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        partial += event.results[i][0]?.transcript || "";
      }
      const nextText = String(partial).trim();
      liveTranscriptRef.current = nextText;
      onChangeRef.current(nextText);
      onTypingRef.current?.();
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      const finalText = String(liveTranscriptRef.current || "").trim();
      if (!finalText || disabledRef.current || loadingRef.current) return;
      onSendRef.current(finalText);
      liveTranscriptRef.current = "";
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.onstart = null;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try {
        recognition.stop();
      } catch {
        // Ignore stop errors during unmount.
      }
      recognitionRef.current = null;
      setIsListening(false);
    };
  }, []);

  const onMicClick = () => {
    if (!speechSupported || disabled || loading) return;

    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }

    liveTranscriptRef.current = "";
    onChange("");
    try {
      recognitionRef.current?.start();
    } catch {
      // Ignore rapid re-click/start errors from browser engine.
    }
  };

  const onPickDocument = async (file) => {
    if (!file || !onAnalyzeDocument || disabled || loading || uploading) return;
    setUploading(true);
    try {
      const extractedText = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("file-read-failed"));
        reader.onload = () => resolve(String(reader.result || ""));
        reader.readAsText(file);
      });
      await onAnalyzeDocument({
        fileName: file.name,
        extractedText: extractedText.slice(0, 20000),
      });
    } catch {
      await onAnalyzeDocument?.({
        fileName: file.name,
        extractedText: "",
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="cc-input-zone">
      <div className="cc-input-wrap">
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.md,.json,.csv,.pdf"
          hidden
          onChange={(event) => onPickDocument(event.target.files?.[0])}
        />
        <button
          type="button"
          className="cc-upload"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || loading || uploading}
          aria-label="Upload document for analysis"
          title="Upload document for AI analysis"
        >
          {uploading ? "..." : "+"}
        </button>
        <textarea
          ref={inputRef}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            onTyping?.();
          }}
          placeholder={placeholder}
          rows={1}
          className="cc-input"
          aria-label="Type your message"
          aria-disabled={disabled}
          disabled={disabled}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              onSend();
            }
          }}
        />
        {hasText ? (
          <button
            type="button"
            className="cc-send"
            onClick={() => onSend()}
            disabled={!canSend}
            aria-label="Send message"
          >
            {"\u2191"}
          </button>
        ) : speechSupported ? (
          <button
            type="button"
            className={`cc-mic ${isListening ? "cc-mic-active" : ""}`}
            onClick={onMicClick}
            disabled={disabled || loading}
            aria-label={isListening ? "Stop voice input" : "Start voice input"}
            title="Use voice input"
          >
            <svg className="cc-mic-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a1 1 0 1 1 2 0 7 7 0 0 1-6 6.93V21h2a1 1 0 1 1 0 2H9a1 1 0 1 1 0-2h2v-2.07A7 7 0 0 1 5 12a1 1 0 1 1 2 0 5 5 0 1 0 10 0Z"
                fill="currentColor"
              />
            </svg>
            {isListening && <span className="cc-mic-dot" aria-hidden="true" />}
          </button>
        ) : null}
      </div>
    </div>
  );
}
