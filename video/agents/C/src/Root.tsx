import React from 'react';
import {Composition} from 'remotion';
import {Main} from './Main';
import {DUR, FPS, H, W} from './lib';

export const Root: React.FC = () => <Composition id="DeskmatesC" component={Main} durationInFrames={DUR} fps={FPS} width={W} height={H} />;
