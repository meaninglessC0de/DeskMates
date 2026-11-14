import { Button } from '@astryxdesign/core/Button';
import { Divider } from '@astryxdesign/core/Divider';
import { DropdownMenu, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@astryxdesign/core/DropdownMenu';
import { HStack } from '@astryxdesign/core/HStack';
import { Icon } from '@astryxdesign/core/Icon';
import { IconButton } from '@astryxdesign/core/IconButton';
import { ToggleButton } from '@astryxdesign/core/ToggleButton';
import { Captions as CaptionsIcon, LayoutGrid, Mic, MicOff, PhoneOff } from 'lucide-react';

export interface LayoutChoice {
  value: string;
  label: string;
  isDisabled?: boolean;
}

export interface ControlBarProps {
  /** Only End is shown (connecting). */
  endOnly?: boolean;
  micOn: boolean;
  micBlocked: boolean;
  onMic: (on: boolean) => void;
  captionsOn: boolean;
  onCaptions: (on: boolean) => void;
  layout: string;
  layouts: LayoutChoice[];
  onLayout: (value: string) => void;
  onEnd: () => void;
}

/** The docked bar: Mute, Captions, Layout, then End, the only filled control. */
export function ControlBar({ endOnly, micOn, micBlocked, onMic, captionsOn, onCaptions, layout, layouts, onLayout, onEnd }: ControlBarProps) {
  return (
    <HStack gap={2} vAlign="center" hAlign="center">
      {endOnly ? null : (
        <>
          <ToggleButton
            label="Mute"
            tooltip="Mute (M)"
            size="lg"
            isIconOnly
            icon={<Icon icon={Mic} size="md" color="inherit" />}
            pressedIcon={<Icon icon={MicOff} size="md" color="inherit" />}
            isPressed={!micOn}
            isDisabled={micBlocked}
            onPressedChange={(pressed) => onMic(!pressed)}
          />
          <ToggleButton
            label="Captions"
            tooltip="Captions (C)"
            size="lg"
            isIconOnly
            icon={<Icon icon={CaptionsIcon} size="md" color="inherit" />}
            isPressed={captionsOn}
            onPressedChange={onCaptions}
          />
          <DropdownMenu
            placement="above"
            hasChevron={false}
            renderTrigger={(props) => (
              <IconButton {...props} variant="ghost" label="Layout" tooltip="Layout (L)" size="lg" icon={<Icon icon={LayoutGrid} size="md" color="inherit" />} />
            )}>
            <DropdownMenuRadioGroup label="Layout" value={layout} onChange={onLayout}>
              {layouts.map((l) => (
                <DropdownMenuRadioItem key={l.value} value={l.value} label={l.label} isDisabled={l.isDisabled} />
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenu>
          <HStack paddingInline={3} height={24}>
            <Divider orientation="vertical" />
          </HStack>
        </>
      )}
      <Button label="End" tooltip={'End (⌘.)'} size="lg" variant="destructive" icon={<Icon icon={PhoneOff} size="md" color="inherit" />} onClick={onEnd} />
    </HStack>
  );
}
