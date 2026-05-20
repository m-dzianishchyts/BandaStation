import {
  Box,
  Button,
  Icon,
  NoticeBox,
  ProgressBar,
  Section,
  Stack,
  Table,
} from 'tgui-core/components';

import { useBackend } from '../../backend';
import type {
  Data,
  OptionResult,
  PollResults,
  RatingOptionResult,
  SelectedPoll,
  TextReply,
} from './types';

type Props = {
  poll: SelectedPoll;
  isPollster: boolean;
};

export const ResultsTab = ({ poll, isPollster }: Props) => {
  if (!poll.can_view_results) {
    return (
      <NoticeBox>
        <Icon name="lock" /> Результаты этого опроса скрыты до его завершения.
      </NoticeBox>
    );
  }

  if (!poll.results) {
    return <NoticeBox>Нет данных по результатам.</NoticeBox>;
  }

  return (
    <ResultsContent
      pollRef={poll.ref}
      results={poll.results}
      isPollster={isPollster}
    />
  );
};

const ResultsContent = ({
  pollRef,
  results,
  isPollster,
}: {
  pollRef: string;
  results: PollResults;
  isPollster: boolean;
}) => {
  switch (results.type) {
    case 'OPTION':
    case 'MULTICHOICE':
    case 'IRV':
      return (
        <OptionResults
          pollRef={pollRef}
          results={results}
          isPollster={isPollster}
        />
      );
    case 'NUMVAL':
      return (
        <RatingResults
          pollRef={pollRef}
          results={results}
          isPollster={isPollster}
        />
      );
    case 'TEXT':
      return (
        <TextResults
          pollRef={pollRef}
          results={results}
          isPollster={isPollster}
        />
      );
    default:
      return <NoticeBox danger>Неизвестный тип опроса.</NoticeBox>;
  }
};

const RespondentAdminPanel = ({
  pollRef,
  ckeys,
}: {
  pollRef: string;
  ckeys: string[];
}) => {
  const { act } = useBackend<Data>();
  if (!ckeys.length) return null;

  return (
    <Section title="Удаление голосов" color="grey">
      <Box color="label" mb={1}>
        Снимает все записи игрока в этом опросе.
      </Box>
      <Stack vertical>
        {ckeys.map((ckey) => (
          <Stack.Item key={ckey}>
            <Stack align="center" justify="space-between">
              <Box fontFamily="monospace" preserveWhitespace>
                {ckey}
              </Box>
              <Button.Confirm
                icon="eraser"
                color="bad"
                confirmContent={`Снять все записи с ${ckey} в этом опросе?`}
                onClick={() =>
                  act('admin_delete_respondent_votes', {
                    poll_ref: pollRef,
                    target_ckey: ckey,
                  })
                }
              >
                Удалить голос
              </Button.Confirm>
            </Stack>
          </Stack.Item>
        ))}
      </Stack>
    </Section>
  );
};

const OptionResults = ({
  pollRef,
  results,
  isPollster,
}: {
  pollRef: string;
  results: PollResults;
  isPollster: boolean;
}) => {
  const options = (results.options ?? []) as OptionResult[];
  const totalVoters = results.total_voters ?? 0;
  // For MULTI, normalize by the total sum of votes so options can be compared against each other
  const denominator =
    results.type === 'MULTICHOICE'
      ? (results.total_votes_sum ?? 0) || 1
      : totalVoters || 1;
  const winner = options.length > 0 ? options[0] : null;

  return (
    <Stack vertical>
      {results.note && (
        <Stack.Item>
          <NoticeBox info>{results.note}</NoticeBox>
        </Stack.Item>
      )}
      {winner && winner.votes > 0 && (
        <Stack.Item>
          <NoticeBox success>
            <Icon name="trophy" /> Лидирует: <strong>{winner.text}</strong> —{' '}
            {winner.votes} гол.
          </NoticeBox>
        </Stack.Item>
      )}
      <Stack.Item>
        <Section>
          <Box color="label" mb={1}>
            Голосующих: {totalVoters}
            {results.type === 'MULTICHOICE' &&
              results.total_votes_sum !== undefined &&
              ` · выбрано опций: ${results.total_votes_sum}`}
          </Box>
          <Table>
            <Table.Row header>
              <Table.Cell>Вариант</Table.Cell>
              <Table.Cell width="20%">Голоса</Table.Cell>
              <Table.Cell width="40%">Доля</Table.Cell>
            </Table.Row>
            {options.map((option) => {
              const percent = option.votes / denominator;
              return (
                <Table.Row key={option.option_id}>
                  <Table.Cell bold>{option.text}</Table.Cell>
                  <Table.Cell>{option.votes}</Table.Cell>
                  <Table.Cell>
                    <ProgressBar
                      value={percent}
                      ranges={{
                        good: [0.5, Infinity],
                        average: [0.25, 0.5],
                        bad: [-Infinity, 0.25],
                      }}
                    >
                      {(percent * 100).toFixed(1)}%
                    </ProgressBar>
                  </Table.Cell>
                </Table.Row>
              );
            })}
          </Table>
        </Section>
      </Stack.Item>
      <Stack.Item>
        {!!isPollster && (
          <RespondentAdminPanel
            pollRef={pollRef}
            ckeys={results.respondent_ckeys ?? []}
          />
        )}
      </Stack.Item>
    </Stack>
  );
};

const RatingResults = ({
  pollRef,
  results,
  isPollster,
}: {
  pollRef: string;
  results: PollResults;
  isPollster: boolean;
}) => {
  const options = (results.options ?? []) as RatingOptionResult[];

  const respondKeys = results.respondent_ckeys ?? [];

  return (
    <Stack vertical>
      {options.map((option) => (
        <Stack.Item key={option.option_id}>
          <Section
            title={option.text}
            buttons={
              <Box color="label">
                Среднее: <strong>{option.average}</strong> (
                {option.total_voters} гол.)
              </Box>
            }
          >
            <Box color="label" mb={1}>
              От {option.min_val} ({option.desc_min || '—'}) до {option.max_val}{' '}
              ({option.desc_max || '—'})
            </Box>
            <Table>
              <Table.Row header>
                <Table.Cell width="15%">Значение</Table.Cell>
                <Table.Cell width="10%">Голоса</Table.Cell>
                <Table.Cell>Распределение</Table.Cell>
              </Table.Row>
              {option.distribution.map((d) => {
                const percent =
                  option.total_voters > 0 ? d.votes / option.total_voters : 0;
                return (
                  <Table.Row key={d.value}>
                    <Table.Cell bold>{d.value}</Table.Cell>
                    <Table.Cell>{d.votes}</Table.Cell>
                    <Table.Cell>
                      <ProgressBar value={percent}>
                        {(percent * 100).toFixed(1)}%
                      </ProgressBar>
                    </Table.Cell>
                  </Table.Row>
                );
              })}
            </Table>
          </Section>
        </Stack.Item>
      ))}
      <Stack.Item>
        {!!isPollster && (
          <RespondentAdminPanel pollRef={pollRef} ckeys={respondKeys} />
        )}
      </Stack.Item>
    </Stack>
  );
};

const TextResults = ({
  pollRef,
  results,
  isPollster,
}: {
  pollRef: string;
  results: PollResults;
  isPollster: boolean;
}) => {
  const replies = results.replies ?? [];

  if (replies.length === 0) {
    return <NoticeBox>Ответов пока нет.</NoticeBox>;
  }

  return (
    <Section>
      <Box color="label" mb={1}>
        <Icon name="user-secret" /> Ответы видны без указания автора. Всего
        ответов: {replies.length}
      </Box>
      <Stack vertical>
        {replies.map((reply, index) => (
          <Stack.Item key={reply.id ?? index}>
            <ReplyCard
              isPollster={isPollster}
              pollRef={pollRef}
              reply={reply}
            />
          </Stack.Item>
        ))}
      </Stack>
    </Section>
  );
};

const ReplyCard = ({
  reply,
  isPollster,
  pollRef,
}: {
  reply: TextReply;
  isPollster: boolean;
  pollRef: string;
}) => {
  const { act } = useBackend<Data>();
  const showDelete =
    !!isPollster && reply.id !== undefined && reply.id !== null;

  return (
    <Section>
      <Stack align="baseline" justify="space-between" gap={1} mb={0.5}>
        <Stack.Item grow>
          <Box color="label">
            <Icon name="clock" /> {reply.datetime}
          </Box>
        </Stack.Item>
        {showDelete ? (
          <Stack.Item shrink={0}>
            <Button.Confirm
              icon="eraser"
              color="bad"
              confirmIcon="triangle-exclamation"
              confirmContent="Удалить этот ответ? Действие необратимо."
              onClick={() =>
                act('admin_delete_text_reply', {
                  poll_ref: pollRef,
                  reply_id: reply.id,
                })
              }
            >
              Удалить
            </Button.Confirm>
          </Stack.Item>
        ) : null}
      </Stack>
      <Box preserveWhitespace mt={showDelete ? 0.5 : 0}>
        {reply.text}
      </Box>
    </Section>
  );
};
