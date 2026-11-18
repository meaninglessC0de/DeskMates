import React from 'react';
import { Composition } from 'remotion';
import { Main } from './Main';
import { MainV2 } from './MainV2';
import { MainV3 } from './MainV3';
import { MainV4 } from './MainV4';

export const Root: React.FC = () => (
  <>
    <Composition id="Deskmates" component={Main} durationInFrames={3600} fps={30} width={1920} height={1080} />
    <Composition id="DeskmatesV2" component={MainV2} durationInFrames={3600} fps={30} width={1920} height={1080} />
    <Composition id="DeskmatesV3" component={MainV3} durationInFrames={3600} fps={30} width={1920} height={1080} />
    <Composition id="DeskmatesV4" component={MainV4} durationInFrames={3600} fps={30} width={1920} height={1080} />
  </>
);
