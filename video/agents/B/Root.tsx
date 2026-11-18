import React from 'react';
import {Composition} from 'remotion';
import {Main} from './Main';
import {FPS, W, H, DURATION} from './geo';

export const Root: React.FC = () => (
  <Composition id="DeskmatesB" component={Main} durationInFrames={Math.round(DURATION * FPS)} fps={FPS} width={W} height={H} />
);
