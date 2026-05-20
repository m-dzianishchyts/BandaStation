import type { CSSProperties } from 'react';
import {
  Box,
  Button,
  Icon,
  NoticeBox,
  Section,
  Stack,
  Tooltip,
} from 'tgui-core/components';

import { useBackend } from '../../backend';
import type { Data, PollBrief, PollType } from './types';

const pollTypeLabels: Record<PollType, string> = {
  OPTION: 'Один вариант',
  TEXT: 'Текстовый ответ',
  NUMVAL: 'Рейтинг',
  MULTICHOICE: 'Множественный выбор',
  IRV: 'Ранжирование',
};

const pollTypeIcons: Record<PollType, string> = {
  OPTION: 'list-ul',
  TEXT: 'pen',
  NUMVAL: 'star',
  MULTICHOICE: 'list-check',
  IRV: 'sort',
};

const uiLockedGreystyle: CSSProperties = {
  opacity: 0.52,
  filter: 'grayscale(0.38)',
  cursor: 'not-allowed',
  pointerEvents: 'none',
};

const POLL_TITLE_IDLE_COLOR = 'hsla(218, 12%, 66%, 0.98)';
const POLL_TITLE_ACTIVE_COLOR = 'rgba(255, 255, 255, 0.96)';

type PollListProps = {
  selectedRef: string | undefined;
  interactionLocked: boolean;
  onSelect: (ref: string) => void;
  onCollapse: () => void;
};

export const PollList = ({
  selectedRef,
  interactionLocked,
  onSelect,
  onCollapse,
}: PollListProps) => {
  const { act, data } = useBackend<Data>();
  const { polls, is_pollster } = data;

  return (
    <Section
      fill
      scrollable
      title="Опросы"
      buttons={
        <Stack>
          {!!is_pollster && (
            <Stack.Item>
              <Button
                icon="rotate"
                tooltip="Перезагрузить опросы из базы данных"
                onClick={() => !interactionLocked && act('reload_polls')}
                style={interactionLocked ? uiLockedGreystyle : undefined}
              />
            </Stack.Item>
          )}
          <Stack.Item>
            <Button
              icon="angles-left"
              tooltip="Свернуть список"
              onClick={onCollapse}
            />
          </Stack.Item>
        </Stack>
      }
    >
      {polls.length === 0 ? (
        <NoticeBox>Нет доступных опросов.</NoticeBox>
      ) : (
        <Stack vertical>
          {polls.map((poll) => (
            <Stack.Item key={poll.ref}>
              <PollCard
                poll={poll}
                active={poll.ref === selectedRef}
                interactionLocked={interactionLocked}
                onSelect={onSelect}
              />
            </Stack.Item>
          ))}
        </Stack>
      )}
    </Section>
  );
};

const PollCard = ({
  poll,
  active,
  interactionLocked,
  onSelect,
}: {
  poll: PollBrief;
  active: boolean;
  interactionLocked: boolean;
  onSelect: (ref: string) => void;
}) => {
  const { act } = useBackend<Data>();
  const isArchived = !!poll.finished;
  const baseBackground = isArchived
    ? 'hsla(220, 6%, 20%, 0.58)'
    : active
      ? 'hsla(210, 34%, 16%, 0.72)'
      : 'hsla(220, 22%, 12%, 0.62)';
  const borderColor = isArchived
    ? 'hsla(220, 8%, 52%, 0.6)'
    : active
      ? 'hsla(205, 90%, 68%, 0.78)'
      : 'hsla(220, 24%, 34%, 0.5)';
  const glow = active
    ? 'inset 0 0 0 1px hsla(205, 95%, 75%, 0.42), 0 0 8px hsla(205, 95%, 65%, 0.2)'
    : isArchived
      ? 'inset 0 0 0 1px hsla(220, 8%, 66%, 0.22)'
      : 'none';
  const titleOpacity = isArchived ? 0.78 : 1;
  const metaOpacity = isArchived ? 0.62 : 0.88;
  const iconOpacity = isArchived ? 0.72 : 1;

  const cardStyle: CSSProperties = {
    margin: 0,
    height: 'auto',
    whiteSpace: 'normal',
    paddingTop: '0.35rem',
    paddingBottom: '0.35rem',
    borderRadius: '6px',
    backgroundColor: baseBackground,
    border: `1px solid ${borderColor}`,
    boxShadow: glow,
    backdropFilter: 'blur(1px)',
    ...(interactionLocked ? uiLockedGreystyle : {}),
  };

  return (
    <Button
      fluid
      textAlign="left"
      selected={false}
      color="transparent"
      style={cardStyle}
      onClick={(event) => {
        event.stopPropagation();
        if (interactionLocked || active) return;
        onSelect(poll.ref);
        act('select_poll', { ref: poll.ref });
      }}
    >
      <Stack align="center" g={0.75}>
        <Stack.Item
          width="1.75rem"
          textAlign="center"
          color="label"
          style={{ opacity: iconOpacity }}
        >
          <Tooltip content={pollTypeLabels[poll.poll_type]}>
            <Icon name={pollTypeIcons[poll.poll_type]} />
          </Tooltip>
        </Stack.Item>
        <Stack.Item grow style={{ minWidth: 0 }}>
          <Stack vertical g={0}>
            <Stack.Item>
              <Stack align="center">
                <Stack.Item grow>
                  <Box
                    bold
                    style={{
                      overflowWrap: 'anywhere',
                      opacity: titleOpacity,
                      color: active
                        ? POLL_TITLE_ACTIVE_COLOR
                        : POLL_TITLE_IDLE_COLOR,
                    }}
                  >
                    {poll.question}
                  </Box>
                </Stack.Item>
                <Stack.Item>
                  <Stack align="center" g={0.5}>
                    {!!poll.admin_only && (
                      <Stack.Item>
                        <Tooltip content="Только для администрации">
                          <Icon name="user-shield" color="gold" />
                        </Tooltip>
                      </Stack.Item>
                    )}
                    {!!poll.finished && (
                      <Stack.Item>
                        <Tooltip content="Архивный опрос">
                          <Icon name="box-archive" color="label" />
                        </Tooltip>
                      </Stack.Item>
                    )}
                    {!!poll.future_poll && !poll.finished && (
                      <Stack.Item>
                        <Tooltip content="Опрос ещё не начался - показано время старта">
                          <Icon name="hourglass-start" color="average" />
                        </Tooltip>
                      </Stack.Item>
                    )}
                    {!!poll.voted && (
                      <Stack.Item>
                        <Tooltip content="Ваш голос учтён">
                          <Icon name="check" color="good" />
                        </Tooltip>
                      </Stack.Item>
                    )}
                  </Stack>
                </Stack.Item>
              </Stack>
            </Stack.Item>
            <Stack.Item>
              <Box
                fontSize={0.88}
                opacity={metaOpacity}
                style={{ color: 'rgba(220, 224, 230, 0.82)' }}
              >
                <Icon name="users" /> {poll.total_votes}
                {' | '}
                <Icon name="calendar-day" />{' '}
                {poll.finished
                  ? `завершён ${poll.end_datetime}`
                  : poll.future_poll
                    ? poll.start_datetime
                      ? `старт ${poll.start_datetime}`
                      : 'ещё не начался'
                    : `до ${poll.end_datetime}`}
              </Box>
            </Stack.Item>
          </Stack>
        </Stack.Item>
      </Stack>
    </Button>
  );
};
