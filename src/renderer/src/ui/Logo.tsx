import markUrl from './brand/deskmates-mark.svg';
import smallUrl from './brand/deskmates-mark-small.svg';

/**
 * The Deskmates mark: four desks, four mates. Alt text is the product name.
 * Below 24 px the handles smear, so the small variant (wider gap, no handles) is used.
 */
export function Logo({ size = 24 }: { size?: number }) {
  return <img src={size < 24 ? smallUrl : markUrl} width={size} height={size} alt="Deskmates" />;
}
