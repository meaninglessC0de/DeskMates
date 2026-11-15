import { Center } from '@astryxdesign/core/Center';
import { Grid } from '@astryxdesign/core/Grid';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';

export interface DeskLoaderProps {
  /** Width of the mark in px (default 40). */
  size?: number;
  /** One short line under the mark, also the accessible name ("Starting Maya's desktop"). */
  label?: string;
}

/**
 * The brand loader for the few waits that matter (app start, a desktop starting, finding a candidate, a call
 * connecting): the four tiles of the mark breathing in turn, clockwise. Opacity only; still under reduced motion.
 * Fills the Astryx gap "branded progress": Spinner is the only indeterminate indicator.
 */
export function DeskLoader({ size = 40, label }: DeskLoaderProps) {
  return (
    <VStack gap={3} hAlign="center" role="status" aria-label={label ?? 'Loading'} data-am-loader-wrap="">
      <Grid data-am-desks="" data-am-loader="" columns={2} width={size} aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <Center key={i} data-am-desk="brand" data-am-desk-slot={String(i)}>
            {null}
          </Center>
        ))}
      </Grid>
      {label ? <Text type="supporting">{label}</Text> : null}
    </VStack>
  );
}
