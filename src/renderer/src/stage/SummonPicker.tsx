import { useEffect, useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { HStack } from '@astryxdesign/core/HStack';
import { Icon } from '@astryxdesign/core/Icon';
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout';
import { List, ListItem } from '@astryxdesign/core/List';
import { Text } from '@astryxdesign/core/Text';
import { Tooltip } from '@astryxdesign/core/Tooltip';
import { Check } from 'lucide-react';
import type { Employee } from '../../../shared';
import { useStore } from '../api/store';
import { Portrait } from '../ui/Portrait';

export interface SummonPickerProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

const MAX_PEOPLE = 4;

const unavailable = (e: Employee): string | null => (e.state === 'offline' ? 'Desktop is off' : e.state === 'paused' ? 'Paused' : null);
const stateWord = (e: Employee): string | null => (e.state === 'working' ? 'Working' : e.state === 'needs_you' ? 'Needs you' : e.state === 'stuck' ? 'Stuck' : null);

/** Who to bring in. One person starts a call, two to four start a meeting. */
export function SummonPicker({ isOpen, onOpenChange }: SummonPickerProps) {
  const employees = useStore((s) => s.employees);
  const openId = useStore((s) => s.ui.selectedId);
  const [picked, setPicked] = useState<string[]>([]);

  const available = employees.filter((e) => !unavailable(e));
  const everyone = available.slice(0, MAX_PEOPLE);

  useEffect(() => {
    if (isOpen) setPicked(openId && available.some((e) => e.id === openId) ? [openId] : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const toggle = (id: string): void => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < MAX_PEOPLE ? [...p, id] : p));
  const allPicked = everyone.length > 0 && everyone.every((e) => picked.includes(e.id));

  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange} width={360}>
      <Layout
        padding={4}
        header={<DialogHeader title="Summon meeting" onOpenChange={onOpenChange} />}
        content={
          <LayoutContent>
            <List density="balanced" data-am-people="" data-am-picker="">
              <ListItem
                label={<Text type="label">Everyone</Text>}
                startContent={
                  <HStack data-am="people-stack" vAlign="center">
                    {everyone.map((e) => (
                      <Portrait key={e.id} person={{ id: e.id, name: e.persona.name, portraitUrl: e.persona.portraitUrl }} size={24} />
                    ))}
                  </HStack>
                }
                endContent={allPicked ? <Icon icon={Check} size="sm" /> : undefined}
                isDisabled={everyone.length === 0}
                onClick={() => setPicked(allPicked ? [] : everyone.map((e) => e.id))}
              />
              {employees.map((e) => {
                const off = unavailable(e);
                const isPicked = picked.includes(e.id);
                const capped = !isPicked && picked.length >= MAX_PEOPLE;
                const word = stateWord(e);
                const row = (
                  <ListItem
                    key={e.id}
                    label={<Text type="label" maxLines={1}>{e.persona.name}</Text>}
                    description={off ?? e.persona.role}
                    startContent={<Portrait person={{ id: e.id, name: e.persona.name, portraitUrl: e.persona.portraitUrl }} size={40} presence={e.state} />}
                    endContent={
                      isPicked ? (
                        <Icon icon={Check} size="sm" />
                      ) : word && !off ? (
                        <Text type="supporting">{word}</Text>
                      ) : undefined
                    }
                    isSelected={isPicked}
                    isDisabled={!!off || capped}
                    onClick={() => toggle(e.id)}
                  />
                );
                return capped ? (
                  <Tooltip key={e.id} content="Up to 4 at once">
                    {row}
                  </Tooltip>
                ) : (
                  row
                );
              })}
            </List>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack hAlign="end">
              <Button
                label="Start meeting"
                variant="primary"
                isDisabled={picked.length === 0}
                onClick={() => void useStore.getState().startCall(picked)}
              />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
