import markUrl from './brand/deskmates-mark.svg';

/** The Deskmates mark: four desks, four mates. Alt text is the product name. */
export function Logo({ size = 24 }: { size?: number }) {
  return <img src={markUrl} width={size} height={size} alt="Deskmates" />;
}
