const base = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const;

export function PlusIcon() {
  return (
    <svg {...base}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

/** Points right when its section is folded; CSS turns it down when the section is open. */
export function ChevronIcon() {
  return (
    <svg {...base} width={16} height={16} strokeWidth={2.5}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

/** Sits inside the ring of a routine that is done for the day. */
export function CheckIcon() {
  return (
    <svg {...base} width={14} height={14} strokeWidth={3.5}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

/** Two arrows chasing each other: swap this suggestion for another. */
export function SwapIcon() {
  return (
    <svg {...base}>
      <path d="M4 9a8 8 0 0 1 14-3l2 2" />
      <path d="M20 4v4h-4" />
      <path d="M20 15a8 8 0 0 1-14 3l-2-2" />
      <path d="M4 20v-4h4" />
    </svg>
  );
}
