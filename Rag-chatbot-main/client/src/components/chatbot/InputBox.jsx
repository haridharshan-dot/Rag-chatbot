import { useEffect, useMemo, useRef } from "react";

export default function InputBox({
  value,
  loading,
  disabled,
  onChange,
  onSend,
  onTyping,
  placeholder,
}) {
  const inputRef = useRef(null);
  const canSend = useMemo(() => value.trim().length > 0 && !loading && !disabled, [value, loading, disabled]);

  useEffect(() => {
    if (!inputRef.current) return;
    inputRef.current.style.height = "auto";
    inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 98)}px`;
  }, [value]);

  useEffect(() => {
    if (!disabled && inputRef.current) {
      inputRef.current.focus();
    }
  }, [disabled]);

  return (
    <div className="cc-input-wrap">
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
        disabled={disabled}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            onSend();
          }
        }}
      />
      <button type="button" className="cc-send" onClick={onSend} disabled={!canSend}>
        Send
      </button>
    </div>
  );
}
