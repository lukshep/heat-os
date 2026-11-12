import { useState, type Ref } from 'react';

interface Props {
  /** Shown inside the empty field, and used as its accessible name. */
  placeholder: string;
  onAdd: (text: string) => void;
  inputRef?: Ref<HTMLInputElement>;
  /** The main capture field stands out; the per-area fields stay quiet until used. */
  prominent?: boolean;
}

/** A one-line field that adds on Return and stays focused, so several things can be entered in a row. */
export function AddInput({ placeholder, onAdd, inputRef, prominent = false }: Props) {
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
        placeholder={placeholder}
        aria-label={placeholder}
        enterKeyHint="done"
        autoComplete="off"
        autoCapitalize="sentences"
      />
    </form>
  );
}
