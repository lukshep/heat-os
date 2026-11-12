import { useState, type Ref } from 'react';

interface Props {
  /** Shown inside the empty field, and used as its accessible name. */
  placeholder: string;
  onAdd: (text: string) => void;
  inputRef?: Ref<HTMLInputElement>;
  /** The main capture field stands out; the others stay quiet until used. */
  prominent?: boolean;
  /** Take the cursor as soon as it appears. For fields that open because they were asked for. */
  autoFocus?: boolean;
  /** Called when the field is left empty or dismissed, so a field that was opened can close again. */
  onDone?: () => void;
}

/** A one-line field that adds on Return and stays focused, so several things can be entered in a row. */
export function AddInput({ placeholder, onAdd, inputRef, prominent = false, autoFocus = false, onDone }: Props) {
  const [text, setText] = useState('');

  return (
    <form
      className={prominent ? 'add is-prominent' : 'add'}
      onSubmit={(event) => {
        event.preventDefault();
        if (!text.trim()) return;
        onAdd(text);
        setText('');
      }}
    >
      <input
        ref={inputRef}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => {
          if (!text.trim()) onDone?.();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onDone?.();
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        enterKeyHint="done"
        autoComplete="off"
        autoCapitalize="sentences"
        autoFocus={autoFocus}
      />
    </form>
  );
}
