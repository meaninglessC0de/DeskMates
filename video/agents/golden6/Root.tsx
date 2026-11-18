import React from 'react';
import { Composition } from 'remotion';
import { Main } from './Main';
import { DURATION, FPS, H, W } from './util';

export const Root: React.FC = () => (
  <Composition id="DeskmatesGolden6" component={Main} durationInFrames={Math.round(DURATION * FPS)} fps={FPS} width={W} height={H} />
);
