import {
  Box,
  Icon,
  NoticeBox,
  ProgressBar,
  Section,
  Stack,
  Table,
} from 'tgui-core/components';

import type {
  OptionResult,
  PollResults,
  RatingOptionResult,
  SelectedPoll,
  TextReply,
} from './types';

type Props = {
  poll: SelectedPoll;
};

export const ResultsTab = ({ poll }: Props) => {
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

  return <ResultsContent results={poll.results} />;
};

const ResultsContent = ({ results }: { results: PollResults }) => {
  switch (results.type) {
    case 'OPTION':
    case 'MULTICHOICE':
    case 'IRV':
      return <OptionResults results={results} />;
    case 'NUMVAL':
      return <RatingResults results={results} />;
    case 'TEXT':
      return <TextResults results={results} />;
    default:
      return <NoticeBox danger>Неизвестный тип опроса.</NoticeBox>;
  }
};

const OptionResults = ({ results }: { results: PollResults }) => {
  const options = (results.options ?? []) as OptionResult[];
  const totalVoters = results.total_voters ?? 0;
  // Для MULTI нормализуем по сумме всех голосов, чтобы опции сравнивались между собой
  // (иначе у одного голосующего с N выборами все опции показывали бы 100%).
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
    </Stack>
  );
};

const RatingResults = ({ results }: { results: PollResults }) => {
  const options = (results.options ?? []) as RatingOptionResult[];

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
    </Stack>
  );
};

const TextResults = ({ results }: { results: PollResults }) => {
  const replies = results.replies ?? [];

  if (replies.length === 0) {
    return <NoticeBox>Ответов пока нет.</NoticeBox>;
  }

  return (
    <Section>
      <Box color="label" mb={1}>
        <Icon name="user-secret" /> Все ответы анонимны. Всего ответов:{' '}
        {replies.length}
      </Box>
      <Stack vertical>
        {replies.map((reply, index) => (
          <Stack.Item key={index}>
            <ReplyCard reply={reply} />
          </Stack.Item>
        ))}
      </Stack>
    </Section>
  );
};

const ReplyCard = ({ reply }: { reply: TextReply }) => {
  return (
    <Section>
      <Box color="label" mb={0.5}>
        <Icon name="clock" /> {reply.datetime}
      </Box>
      <Box preserveWhitespace>{reply.text}</Box>
    </Section>
  );
};
