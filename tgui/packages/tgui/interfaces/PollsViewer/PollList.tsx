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

const POLL_TYPE_LABELS: Record<PollType, string> = {
  OPTION: 'Один вариант',
  TEXT: 'Текстовый ответ',
  NUMVAL: 'Рейтинг',
  MULTICHOICE: 'Множественный выбор',
  IRV: 'Ранжирование',
};

const POLL_TYPE_ICONS: Record<PollType, string> = {
  OPTION: 'list-ul',
  TEXT: 'pen',
  NUMVAL: 'star',
  MULTICHOICE: 'list-check',
  IRV: 'sort',
};

type PollListProps = {
  selectedRef: string | undefined;
  onSelect: (ref: string) => void;
  onCollapse: () => void;
};

export const PollList = ({ selectedRef, onSelect, onCollapse }: PollListProps) => {
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
                onClick={() => act('reload_polls')}
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
  onSelect,
}: {
  poll: PollBrief;
  active: boolean;
  onSelect: (ref: string) => void;
}) => {
  const { act } = useBackend<Data>();
  const isArchived = !!poll.finished;
  const baseBackground = isArchived
    ? 'hsla(0, 22%, 16%, 0.62)'
    : active
      ? 'hsla(210, 34%, 16%, 0.72)'
      : 'hsla(220, 22%, 12%, 0.62)';
  const borderColor = isArchived
    ? 'hsla(0, 70%, 52%, 0.72)'
    : active
      ? 'hsla(205, 90%, 68%, 0.78)'
      : 'hsla(220, 24%, 34%, 0.5)';
  const glow = active
    ? 'inset 0 0 0 1px hsla(205, 95%, 75%, 0.42), 0 0 8px hsla(205, 95%, 65%, 0.2)'
    : isArchived
      ? 'inset 0 0 0 1px hsla(0, 80%, 60%, 0.26)'
      : 'none';

  return (
    <Button
      fluid
      textAlign="left"
      selected={active}
      color="transparent"
      style={{
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
      }}
      onClick={(event) => {
        event.stopPropagation();
        if (!active) {
          onSelect(poll.ref);
          act('select_poll', { ref: poll.ref });
        }
      }}
    >
      <Stack align="center" g={0.75}>
        <Stack.Item width="1.75rem" textAlign="center" color="label">
          <Tooltip content={POLL_TYPE_LABELS[poll.poll_type]}>
            <Icon name={POLL_TYPE_ICONS[poll.poll_type]} />
          </Tooltip>
        </Stack.Item>
        <Stack.Item grow style={{ minWidth: 0 }}>
          <Stack vertical g={0}>
            <Stack.Item>
              <Stack align="center">
                <Stack.Item grow>
                  <Box bold style={{ overflowWrap: 'anywhere' }}>
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
              <Box color="label" fontSize={0.88} opacity={0.88}>
                <Icon name="users" /> {poll.total_votes}
                {' | '}
                <Icon name="calendar-day" />{' '}
                {poll.finished
                  ? `завершён ${poll.end_datetime}`
                  : `до ${poll.end_datetime}`}
              </Box>
            </Stack.Item>
          </Stack>
        </Stack.Item>
      </Stack>
    </Button>
  );
};
