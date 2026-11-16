import { useEffect, type RefObject } from 'react';

/** Long enough for focus to land on the next field when it moves from one field to another. */
const KEYBOARD_GONE_MS = 150;
/** Differences smaller than this are rounding, not a shrunken screen. */
const TOLERANCE_PX = 4;

const TEXT_FIELD = 'input, textarea, select, [contenteditable="true"]';

function isTextField(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.matches(TEXT_FIELD);
}

/**
 * Keeps the app the full height of the screen after the keyboard closes. In a web app saved
 * to an iPhone's home screen, iOS can leave the screen measured short once the keyboard has
 * gone, so the app stops above the bottom with a gap under the tab bar until the page is
 * swiped. When the frame comes back shorter than it was before the keyboard came up, it is
 * taken out of the layout for a moment and put back, which makes iOS measure the screen
 * again. Everywhere else the frame keeps its height and this does nothing.
 */
export function useFullHeight(frame: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    let before = 0;
    let timer = 0;

    function onFocusIn(event: FocusEvent) {
      // Measured as the keyboard is about to come up, not when focus moves between fields.
      if (isTextField(event.target) && !isTextField(event.relatedTarget)) {
        before = frame.current?.clientHeight ?? 0;
      }
    }

    function onFocusOut() {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const element = frame.current;
        if (!element || before === 0 || isTextField(document.activeElement)) return;
        if (element.clientHeight < before - TOLERANCE_PX) refit(element);
        before = 0;
      }, KEYBOARD_GONE_MS);
    }

    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
    };
  }, [frame]);
}

/**
 * Lays the frame out again from scratch, all in one task so nothing is painted in between.
 * Taking it out of the layout loses where its lists were scrolled to, so they are put back.
 */
function refit(element: HTMLElement): void {
  const scrolled = [...element.querySelectorAll<HTMLElement>('*')]
    .filter((child) => child.scrollTop !== 0 || child.scrollLeft !== 0)
    .map((child) => ({ child, top: child.scrollTop, left: child.scrollLeft }));
  element.style.display = 'none';
  void element.offsetHeight;
  element.style.display = '';
  for (const { child, top, left } of scrolled) {
    child.scrollTop = top;
    child.scrollLeft = left;
  }
}
