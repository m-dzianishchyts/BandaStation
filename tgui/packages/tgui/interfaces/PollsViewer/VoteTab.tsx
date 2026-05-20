import type { CSSProperties } from 'react';
import {
  Box,
  Button,
  Icon,
  NoticeBox,
  Section,
  Slider,
  Stack,
  TextArea,
} from 'tgui-core/components';

import type { PollOption, SelectedPoll } from './types';
import type { VoteDraft } from './voteDraft';
import { isVoteSubmitBlocked } from './voteDraft';

const isString = (value: string | undefined): value is string => value !== undefined;

const rowLockedGreystyle: CSSProperties = {
  opacity: 0.52,
  filter: 'grayscale(0.38)',
};

type VoteTabProps = {
  poll: SelectedPoll;
  draft: VoteDraft;
  setDraft: (draft: VoteDraft) => void;
  // Block edits when server processing a poll action
  controlsLocked?: boolean;
};

export function VoteTab({
  poll,
  draft,
  setDraft,
  controlsLocked = false,
}: VoteTabProps) {
  if (isVoteSubmitBlocked(poll)) {
    return (
      <NoticeBox success>
        <Icon name="check" /> Вы уже проголосовали.
      </NoticeBox>
    );
  }

  switch (poll.poll_type) {
    case 'OPTION':
      return (
        <VoteOption
          poll={poll}
          draft={draft}
          setDraft={setDraft}
          controlsLocked={controlsLocked}
        />
      );
    case 'TEXT':
      return (
        <VoteText
          draft={draft}
          setDraft={setDraft}
          controlsLocked={controlsLocked}
        />
      );
    case 'NUMVAL':
      return (
        <VoteRating
          poll={poll}
          draft={draft}
          setDraft={setDraft}
          controlsLocked={controlsLocked}
        />
      );
    case 'MULTICHOICE':
      return (
        <VoteMulti
          poll={poll}
          draft={draft}
          setDraft={setDraft}
          controlsLocked={controlsLocked}
        />
      );
    default:
      return <NoticeBox danger>Неизвестный тип опроса.</NoticeBox>;
  }
}

function VoteOption({
  poll,
  draft,
  setDraft,
  controlsLocked = false,
}: VoteTabProps) {
  const selectedRef = draft.optionRef;

  return (
    <Stack vertical>
      {poll.options.map((option) => {
        const isSelected = selectedRef === option.ref;
        return (
          <Stack.Item key={option.ref}>
            <ChoiceRow
              kind="radio"
              selected={isSelected}
              disabled={controlsLocked}
              tooltip={controlsLocked ? 'Ожидание ответа сервера…' : undefined}
              label={option.text}
              onClick={() => setDraft({ ...draft, optionRef: option.ref })}
            />
          </Stack.Item>
        );
      })}
    </Stack>
  );
}

function VoteText({
  draft,
  setDraft,
  controlsLocked = false,
}: Omit<VoteTabProps, 'poll'>) {
  const text = draft.text ?? '';

  return (
    <Stack fill vertical>
      <Stack.Item>
        <NoticeBox info>
          <Icon name="circle-info" /> Другие не видят, чей это ответ. Отправляя
          текст, вы соглашаетесь с правилами. Недопустимые ответы могут быть
          удалены администрацией.
        </NoticeBox>
      </Stack.Item>
      <Stack.Item grow>
        <TextArea
          fluid
          height="100%"
          value={text}
          maxLength={2048}
          style={controlsLocked ? rowLockedGreystyle : undefined}
          onChange={(value) =>
            !controlsLocked && setDraft({ ...draft, text: value })
          }
          placeholder="Введите ваш ответ..."
        />
      </Stack.Item>
      <Stack.Item>
        <Box color="label" textAlign="right">
          {text.length} / 2048
        </Box>
      </Stack.Item>
    </Stack>
  );
}

function VoteRating({
  poll,
  draft,
  setDraft,
  controlsLocked = false,
}: VoteTabProps) {
  const ratings = draft.ratings ?? {};

  return (
    <Stack vertical>
      {poll.options.map((option) => (
        <Stack.Item key={option.ref}>
          <RatingRow
            option={option}
            value={
              ratings[option.ref] ??
              poll.user_votes?.ratings?.[option.id] ??
              option.min_val ??
              1
            }
            controlsLocked={controlsLocked}
            onChange={(v) =>
              setDraft({
                ...draft,
                ratings: { ...ratings, [option.ref]: v },
              })
            }
          />
        </Stack.Item>
      ))}
    </Stack>
  );
}

function RatingRow({
  option,
  value,
  onChange,
  controlsLocked = false,
}: {
  option: PollOption;
  value: number;
  onChange: (v: number) => void;
  controlsLocked?: boolean;
}) {
  const min = option.min_val ?? 1;
  const max = option.max_val ?? 5;

  return (
    <Section
      title={option.text}
      style={
        controlsLocked
          ? { opacity: 0.55, pointerEvents: 'none' as const }
          : undefined
      }
    >
      <Stack vertical>
        {(option.desc_min || option.desc_mid || option.desc_max) && (
          <Stack.Item>
            <Stack>
              <Stack.Item grow color="bad">
                {option.desc_min ? `${min}: ${option.desc_min}` : min}
              </Stack.Item>
              {option.desc_mid && (
                <Stack.Item grow textAlign="center" color="average">
                  {option.desc_mid}
                </Stack.Item>
              )}
              <Stack.Item grow textAlign="right" color="good">
                {option.desc_max ? `${max}: ${option.desc_max}` : max}
              </Stack.Item>
            </Stack>
          </Stack.Item>
        )}
        <Stack.Item>
          <Slider
            tickWhileDragging
            width="100%"
            value={value}
            minValue={min}
            maxValue={max}
            step={1}
            onChange={(_, v) => !controlsLocked && onChange(v)}
          />
        </Stack.Item>
      </Stack>
    </Section>
  );
}

function VoteMulti({
  poll,
  draft,
  setDraft,
  controlsLocked = false,
}: VoteTabProps) {
  const selected = draft.optionRefs ?? [];
  const max = poll.options_allowed ?? poll.options.length;

  function toggle(ref: string) {
    if (controlsLocked) return;
    const has = selected.includes(ref);
    let next: string[];
    if (has) {
      next = selected.filter((r) => r !== ref);
    } else {
      if (selected.length >= max) return;
      next = [...selected, ref];
    }
    setDraft({ ...draft, optionRefs: next });
  }

  return (
    <Stack vertical>
      <Stack.Item>
        <Box color="label">
          Выбрано: {selected.length} / {max}
        </Box>
      </Stack.Item>
      {poll.options.map((option) => {
        const isSelected = selected.includes(option.ref);
        const reachedMax = !isSelected && selected.length >= max;
        return (
          <Stack.Item key={option.ref}>
            <ChoiceRow
              kind="checkbox"
              selected={isSelected}
              disabled={reachedMax || controlsLocked}
              tooltip={controlsLocked ? 'Ожидание ответа сервера…' : undefined}
              label={option.text}
              onClick={() => toggle(option.ref)}
            />
          </Stack.Item>
        );
      })}
    </Stack>
  );
}

type ChoiceRowProps = {
  kind: 'radio' | 'checkbox';
  selected: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  tooltip?: string;
};

function ChoiceRow({
  kind,
  selected,
  disabled,
  label,
  onClick,
  tooltip,
}: ChoiceRowProps) {
  const indicatorIcon =
    kind === 'radio'
      ? selected
        ? 'dot-circle'
        : 'circle'
      : selected
        ? 'square-check'
        : 'square';

  return (
    <Button
      fluid
      textAlign="left"
      selected={false}
      color="transparent"
      icon={indicatorIcon}
      style={{
        ...(selected
          ? {
              color: 'rgba(255, 255, 255, 0.94)',
              borderLeft: '3px solid hsla(205, 65%, 55%, 0.55)',
              boxSizing: 'border-box',
            }
          : { color: 'rgba(218, 222, 230, 0.88)' }),
        ...(disabled ? rowLockedGreystyle : {}),
      }}
      onClick={disabled ? undefined : onClick}
      tooltip={
        tooltip ??
        (disabled && kind === 'checkbox'
          ? 'Достигнут лимит вариантов'
          : undefined)
      }
    >
      {label}
    </Button>
  );
}
