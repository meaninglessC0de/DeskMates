import { Center } from '@astryxdesign/core/Center';
import { Grid } from '@astryxdesign/core/Grid';
import { Icon } from '@astryxdesign/core/Icon';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Plus } from 'lucide-react';
import { tintIndex } from './tint';

export interface DeskPerson {
  id: string;
  name: string;
  portraitUrl?: string | null;
}

export interface DesksProps {
  /** Up to four people; each fills a desk in their own tint. The rest stay empty, in the soft tint of that desk's brand colour. */
  people?: DeskPerson[];
  /** Width of the whole two-by-two, in px. Tiles and gap follow the mark's numbers (tile 100, gap 13, of 213). */
  size?: number;
  /** When set, the first empty desk is a button (Plus, "Hire a deskmate"). */
  onAdd?: () => void;
}

const DESKS = 4;

/**
 * Four desks, four deskmates: the Deskmates mark at human scale. A full team reads as the logo.
 * Fills the Astryx gap "capacity motif": no primitive draws a fixed set of slots.
 */
export function Desks({ people = [], size = 96, onAdd }: DesksProps) {
  const firstEmpty = people.length < DESKS ? people.length : -1;
  const label = `${Math.min(people.length, DESKS)} of ${DESKS} desks filled`;
  return (
    <Grid data-am-desks="" data-am-desks-size={size >= 64 ? 'large' : 'small'} columns={2} width={size} aria-label={label} role="img">
      {Array.from({ length: DESKS }, (_, i) => {
        const p = people[i];
        if (p) {
          return <Center key={p.id} data-am-desk="filled" data-am-tint={String(tintIndex(p.id, p.name, p.portraitUrl ?? ''))}>{null}</Center>;
        }
        if (onAdd && i === firstEmpty) {
          return (
            <IconButton
              key={`add-${i}`}
              data-am-desk="add"
              data-am-tint={String(i)}
              label="Hire a deskmate"
              tooltip="Hire a deskmate (⌘N)"
              variant="ghost"
              icon={<Icon icon={Plus} size="sm" />}
              onClick={onAdd}
            />
          );
        }
        return <Center key={`empty-${i}`} data-am-desk="empty" data-am-tint={String(i)}>{null}</Center>;
      })}
    </Grid>
  );
}
