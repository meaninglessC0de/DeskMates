import { useEffect, useState } from 'react';
import type { Size } from './layout';

const read = (): Size => ({ w: window.innerWidth, h: window.innerHeight });

/** The window's inner size, kept current. The stage computes tile sizes from it. */
export function useWindowSize(): Size {
  const [size, setSize] = useState<Size>(read);
  useEffect(() => {
    const on = (): void => setSize(read());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return size;
}
