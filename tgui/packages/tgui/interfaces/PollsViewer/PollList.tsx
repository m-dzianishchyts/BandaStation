import {
  Box,
  Button,
  Icon,
  NoticeBox,
  Section,
  Stack,
  Tooltip,
} from 'tgui-core/components';
import { classes } from 'tgui-core/react';

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
              <PollCard poll={poll} active={poll.ref === selectedRef} />
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
}: {
  poll: PollBrief;
  active: boolean;
}) => {
  const { act } = useBackend<Data>();

  return (
    <div
      className={classes([
        'PollsViewer__Card',
        active && 'PollsViewer__Card--active',
        poll.finished && 'PollsViewer__Card--archived',
      ])}
      onClick={() => {
        if (!active) {
          act('select_poll', { ref: poll.ref });
        }
      }}
    >
      <Stack align="center" mb={0.5}>
        <Stack.Item>
          <Tooltip content={POLL_TYPE_LABELS[poll.poll_type]}>
            <Icon name={POLL_TYPE_ICONS[poll.poll_type]} />
          </Tooltip>
        </Stack.Item>
        <Stack.Item grow className="PollsViewer__Card--Title">
          {poll.question}
        </Stack.Item>
        {!!poll.voted && (
          <Stack.Item>
            <Tooltip content="Ваш голос учтён">
              <Icon name="check" color="good" />
            </Tooltip>
          </Stack.Item>
        )}
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
      </Stack>
      <Box className="PollsViewer__Card--Meta">
        <Icon name="users" /> {poll.total_votes}
        {' · '}
        <Icon name="calendar-day" />{' '}
        {poll.finished
          ? `завершён ${poll.end_datetime}`
          : `до ${poll.end_datetime}`}
      </Box>
    </div>
  );
};
