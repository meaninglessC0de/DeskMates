import React from 'react';
import { Composition } from 'remotion';
import { Main } from './Main';

export const Root: React.FC = () => (
  <Composition id="Deskmates" component={Main} durationInFrames={3600} fps={30} width={1920} height={1080} />
);
