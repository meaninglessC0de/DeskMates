import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Layout, LayoutContent } from '@astryxdesign/core/Layout';
import { Item } from '@astryxdesign/core/Item';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Switch } from '@astryxdesign/core/Switch';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { VStack } from '@astryxdesign/core/VStack';
import type { Capabilities, Settings } from '../../../shared';
import { useStore } from '../api/store';

export interface SettingsDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

type Dot = 'success' | 'warning' | 'neutral';

function connections(c: Capabilities | null): { key: string; label: string; value: string; dot: Dot }[] {
  if (!c) return [];
  return [
    { key: 'model', label: 'AI', value: c.llm ? 'Connected' : 'Not set up', dot: c.llm ? 'success' : 'warning' },
    { key: 'desktops', label: 'Desks', value: c.desktops === 'cua' ? 'Ready' : 'Demo', dot: c.desktops === 'cua' ? 'success' : 'warning' },
    { key: 'calls', label: 'Video calls', value: c.calls === 'avatar' ? 'Video and voice' : c.calls === 'audio' ? 'Voice only' : 'Off', dot: c.calls === 'off' ? 'neutral' : c.calls === 'audio' ? 'warning' : 'success' },
    { key: 'databricks', label: 'Databricks', value: c.databricks ? 'Connected' : 'Not set up', dot: c.databricks ? 'success' : 'neutral' },
  ];
}

export function SettingsDialog({ isOpen, onOpenChange }: SettingsDialogProps) {
  const settings = useStore((s) => s.settings);
  const capabilities = useStore((s) => s.capabilities);
  const save = useStore.getState().updateSettings;

  const [name, setName] = useState(settings?.userName ?? '');
  const saved = useRef(settings?.userName ?? '');

  useEffect(() => {
    if (isOpen) {
      setName(settings?.userName ?? '');
      saved.current = settings?.userName ?? '';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // The name saves a moment after typing stops; there is no Save button.
  useEffect(() => {
    const next = name.trim();
    if (!isOpen || !next || next === saved.current) return;
    const t = setTimeout(() => {
      saved.current = next;
      void save({ userName: next });
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, isOpen]);

  const set = (patch: Partial<Settings>): void => void save(patch);

  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange} width={480}>
      <Layout
        height="auto"
        header={<DialogHeader title="Settings" onOpenChange={onOpenChange} />}
        content={
          <LayoutContent>
            {settings ? (
              <VStack gap={6} data-am-sections="">
                <TextInput label="Your name" value={name} onChange={setName} />

                <VStack gap={2}>
                  <Text type="label">Appearance</Text>
                  <SegmentedControl label="Appearance" value={settings.appearance} onChange={(v) => set({ appearance: v as Settings['appearance'] })}>
                    <SegmentedControlItem value="light" label="Light" />
                    <SegmentedControlItem value="dark" label="Dark" />
                    <SegmentedControlItem value="system" label="System" />
                  </SegmentedControl>
                </VStack>

                <VStack gap={3}>
                  <Text type="label">Notifications</Text>
                  <Switch label="Messages" labelPosition="start" labelSpacing="spread" value={settings.notifyMessages} changeAction={async (v) => set({ notifyMessages: v })} />
                  <Switch label="When a task finishes" labelPosition="start" labelSpacing="spread" value={settings.notifyDone} changeAction={async (v) => set({ notifyDone: v })} />
                </VStack>

                <VStack gap={3}>
                  <Text type="label">Calls</Text>
                  <Switch label="Captions on by default" labelPosition="start" labelSpacing="spread" value={settings.captions} changeAction={async (v) => set({ captions: v })} />
                </VStack>

                <VStack gap={1} data-am-connections="">
                  <Text type="label">Connections</Text>
                  {connections(capabilities).map((c) => (
                    <Item
                      key={c.key}
                      density="compact"
                      label={c.label}
                      startContent={<StatusDot variant={c.dot} label={c.value} />}
                      endContent={<Text type="supporting">{c.value}</Text>}
                    />
                  ))}
                </VStack>
              </VStack>
            ) : null}
          </LayoutContent>
        }
      />
    </Dialog>
  );
}
