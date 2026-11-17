import type { ReactNode } from 'react';

function Svg({ children, size = 20, fill = false }: { children: ReactNode; size?: number; fill?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ? 'currentColor' : 'none'}
      stroke={fill ? 'none' : 'currentColor'}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export const Back = () => <Svg size={22}><path d="M15 5l-7 7 7 7" /></Svg>;
export const Close = () => <Svg size={22}><path d="M6 6l12 12M18 6L6 18" /></Svg>;
export const Headphones = () => (
  <Svg size={18}><path d="M4 14v-2a8 8 0 0116 0v2" /><rect x="3" y="14" width="4" height="6" rx="1" /><rect x="17" y="14" width="4" height="6" rx="1" /></Svg>
);
export const Bolt = () => <Svg size={18}><path d="M13 3L5 14h6l-1 7 8-11h-6l1-7z" /></Svg>;
export const Panel = () => <Svg><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M15 4v16" /></Svg>;
export const Flag = () => <Svg><path d="M5 21V4" /><path d="M5 4h12l-2 4 2 4H5" /></Svg>;
export const Pencil = () => <Svg><path d="M4 20h4l10-10-4-4L4 16v4z" /></Svg>;
export const Note = () => <Svg><path d="M5 4h14v11l-5 5H5V4z" /><path d="M14 20v-5h5" /></Svg>;
export const Copy = () => <Svg><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 012-2h9" /></Svg>;
export const Trash = () => <Svg><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></Svg>;
export const Play = () => <Svg size={28} fill><path d="M8 5v14l11-7L8 5z" /></Svg>;
export const Pause = () => <Svg size={28} fill><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></Svg>;
export const PrevSentence = () => <Svg><path d="M6 5v14" /><path d="M19 5l-9 7 9 7V5z" /></Svg>;
export const NextSentence = () => <Svg><path d="M18 5v14" /><path d="M5 5l9 7-9 7V5z" /></Svg>;
export const Rewind = () => <Svg><path d="M12 6l-8 6 8 6V6z" /><path d="M21 6l-8 6 8 6V6z" /></Svg>;
export const Forward = () => <Svg><path d="M3 6l8 6-8 6V6z" /><path d="M12 6l8 6-8 6V6z" /></Svg>;
export const ChevronDown = () => <Svg><path d="M6 9l6 6 6-6" /></Svg>;
