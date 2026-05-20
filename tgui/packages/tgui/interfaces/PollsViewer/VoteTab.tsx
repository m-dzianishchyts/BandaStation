import { Box, Button, Icon, NoticeBox, Section, Slider, Stack, TextArea } from 'tgui-core/components';

import type { PollOption, SelectedPoll } from './types';
import type { VoteDraft } from './voteDraft';

type VoteTabProps = {
  poll: SelectedPoll;
  draft: VoteDraft;
  setDraft: (draft: VoteDraft) => void;
};

/**
 * Голосование в выбранном опросе. Draft-состояние голоса поднято в PollDetails,
 * чтобы сабмит можно было отрендерить в прилепленном к низу футере.
 */
export const VoteTab = ({ poll, draft, setDraft }: VoteTabProps) => {
  const alreadyVoted = hasUserVoted(poll);

  if (alreadyVoted && !poll.allow_revoting) {
    return (
      <NoticeBox success>
        <Icon name="check" /> Вы уже проголосовали.
      </NoticeBox>
    );
  }

  switch (poll.poll_type) {
    case 'OPTION':
      return <VoteOption poll={poll} draft={draft} setDraft={setDraft} />;
    case 'TEXT':
      return <VoteText draft={draft} setDraft={setDraft} />;
    case 'NUMVAL':
      return <VoteRating poll={poll} draft={draft} setDraft={setDraft} />;
    case 'MULTICHOICE':
      return <VoteMulti poll={poll} draft={draft} setDraft={setDraft} />;
    case 'IRV':
      return <VoteIRV poll={poll} draft={draft} setDraft={setDraft} />;
    default:
      return <NoticeBox danger>Неизвестный тип опроса.</NoticeBox>;
  }
};

function hasUserVoted(poll: SelectedPoll): boolean {
  const uv = poll.user_votes;
  if (!uv) return false;
  if (uv.option_id !== undefined && uv.option_id !== null) return true;
  if (uv.option_ids && uv.option_ids.length > 0) return true;
  if (uv.ranking && uv.ranking.length > 0) return true;
  if (uv.ratings && Object.keys(uv.ratings).length > 0) return true;
  if (uv.text) return true;
  return false;
}

// ─── Radio-like одиночный выбор ───────────────────────────────────────────────

const VoteOption = ({ poll, draft, setDraft }: VoteTabProps) => {
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
              label={option.text}
              onClick={() => setDraft({ ...draft, optionRef: option.ref })}
            />
          </Stack.Item>
        );
      })}
    </Stack>
  );
};

// ─── Свободный текст ──────────────────────────────────────────────────────────

const VoteText = ({
  draft,
  setDraft,
}: Omit<VoteTabProps, 'poll'>) => {
  const text = draft.text ?? '';

  return (
    <Stack fill vertical>
      <Stack.Item>
        <NoticeBox info>
          <Icon name="circle-info" /> Ответы отправляются анонимно, но должны
          соответствовать правилам проекта. Недопустимые ответы могут быть
          удалены администрацией.
        </NoticeBox>
      </Stack.Item>
      <Stack.Item grow>
        <TextArea
          fluid
          height="100%"
          value={text}
          maxLength={2048}
          onChange={(value) => setDraft({ ...draft, text: value })}
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
};

// ─── Рейтинг ──────────────────────────────────────────────────────────────────

const VoteRating = ({ poll, draft, setDraft }: VoteTabProps) => {
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
};

const RatingRow = ({
  option,
  value,
  onChange,
}: {
  option: PollOption;
  value: number;
  onChange: (v: number) => void;
}) => {
  const min = option.min_val ?? 1;
  const max = option.max_val ?? 5;

  return (
    <Section title={option.text}>
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
            onChange={(_, v) => onChange(v)}
          />
        </Stack.Item>
      </Stack>
    </Section>
  );
};

// ─── Множественный выбор ──────────────────────────────────────────────────────

const VoteMulti = ({ poll, draft, setDraft }: VoteTabProps) => {
  const selected = draft.optionRefs ?? [];
  const max = poll.options_allowed ?? poll.options.length;

  const toggle = (ref: string) => {
    const has = selected.includes(ref);
    let next: string[];
    if (has) {
      next = selected.filter((r) => r !== ref);
    } else {
      if (selected.length >= max) return;
      next = [...selected, ref];
    }
    setDraft({ ...draft, optionRefs: next });
  };

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
              disabled={reachedMax}
              label={option.text}
              onClick={() => toggle(option.ref)}
            />
          </Stack.Item>
        );
      })}
    </Stack>
  );
};

// ─── IRV ──────────────────────────────────────────────────────────────────────

const VoteIRV = ({ poll, draft, setDraft }: VoteTabProps) => {
  const order =
    draft.ranking ??
    (poll.user_votes?.ranking?.length
      ? (poll.user_votes.ranking
          .map((id) => poll.options.find((o) => o.id === id)?.ref)
          .filter(Boolean) as string[])
      : poll.options.map((o) => o.ref));

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    [next[index], next[target]] = [next[target], next[index]];
    setDraft({ ...draft, ranking: next });
  };

  const byRef = new Map(poll.options.map((o) => [o.ref, o]));

  return (
    <Stack vertical>
      <Stack.Item>
        <Box color="label">
          Расположите варианты в порядке предпочтения (наиболее
          предпочтительные сверху).
        </Box>
      </Stack.Item>
      {order.map((ref, index) => {
        const option = byRef.get(ref);
        if (!option) return null;
        return (
          <Stack.Item key={ref}>
            <Section>
              <Stack align="center">
                <Stack.Item width="2.5em" textAlign="center" bold>
                  #{index + 1}
                </Stack.Item>
                <Stack.Item grow>{option.text}</Stack.Item>
                <Stack.Item>
                  <IrvButton
                    icon="arrow-up"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  />
                </Stack.Item>
                <Stack.Item>
                  <IrvButton
                    icon="arrow-down"
                    disabled={index === order.length - 1}
                    onClick={() => move(index, 1)}
                  />
                </Stack.Item>
              </Stack>
            </Section>
          </Stack.Item>
        );
      })}
    </Stack>
  );
};

const IrvButton = ({
  icon,
  disabled,
  onClick,
}: {
  icon: string;
  disabled?: boolean;
  onClick: () => void;
}) => (
  <Box
    as="button"
    onClick={disabled ? undefined : onClick}
    style={{
      background: 'transparent',
      border: '1px solid var(--color-label)',
      color: disabled ? 'var(--color-gray)' : 'inherit',
      borderRadius: '4px',
      padding: '4px 8px',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.4 : 1,
    }}
  >
    <Icon name={icon} />
  </Box>
);

// ─── Общая радио/чекбокс строка ───────────────────────────────────────────────

type ChoiceRowProps = {
  kind: 'radio' | 'checkbox';
  selected: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
};

const ChoiceRow = ({
  kind,
  selected,
  disabled,
  label,
  onClick,
}: ChoiceRowProps) => {
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
      selected={selected}
      disabled={disabled}
      color={selected ? 'good' : 'default'}
      icon={indicatorIcon}
      onClick={disabled ? undefined : onClick}
      tooltip={disabled ? 'Достигнут лимит вариантов' : undefined}
    >
      {label}
    </Button>
  );
};
