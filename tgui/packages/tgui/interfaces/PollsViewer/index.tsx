import type { CSSProperties } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Box, Button, Icon, Section, Stack, Tabs } from 'tgui-core/components';

import { useBackend } from '../../backend';
import { Window } from '../../layouts';
import { PollList } from './PollList';
import { ResultsTab } from './ResultsTab';
import type { Data, SelectedPoll } from './types';
import { VoteTab } from './VoteTab';
import {
  buildVotePayload,
  makeInitialDraft,
  type VoteDraft,
} from './voteDraft';

type TabId = 'vote' | 'results';

const uiLockedGreystyle: CSSProperties = {
  opacity: 0.52,
  filter: 'grayscale(0.38)',
  pointerEvents: 'none',
  cursor: 'not-allowed',
};

export const PollsViewer = () => {
  const { data } = useBackend<Data>();
  const { selected_poll } = data;
  const [listCollapsed, setListCollapsed] = useState(false);
  // pendingRef - poll being clicked but no response yet
  const [pendingRef, setPendingRef] = useState<string | null>(null);

  // change loading indicator when backend sent data
  useEffect(() => {
    if (!selected_poll || !pendingRef) return;
    if (selected_poll.ref === pendingRef) {
      setPendingRef(null);
      return;
    }
    // Keep pending until id matches
    if (
      pendingRef.startsWith('archived:') &&
      Number(pendingRef.slice('archived:'.length)) === selected_poll.id
    ) {
      setPendingRef(null);
    }
  }, [selected_poll, pendingRef]);

  const activeRef = selected_poll?.ref ?? pendingRef ?? undefined;
  const awaitingSelectionDetail = Boolean(
    pendingRef !== null && (!selected_poll || selected_poll.ref !== pendingRef),
  );
  const interactionLocked = awaitingSelectionDetail || Boolean(data.ui_busy);

  return (
    <Window title="Опросы" width={1024} height={680}>
      <Window.Content>
        <Stack fill>
          {!listCollapsed && (
            <Stack.Item
              basis="23%"
              grow
              style={{ minWidth: '180px', maxWidth: '320px' }}
            >
              <PollList
                selectedRef={activeRef}
                interactionLocked={interactionLocked}
                onSelect={(ref) => setPendingRef(ref)}
                onCollapse={() => setListCollapsed(true)}
              />
            </Stack.Item>
          )}
          <Stack.Item grow>
            <Stack fill vertical>
              {listCollapsed && (
                <Stack.Item>
                  <Button icon="bars" onClick={() => setListCollapsed(false)}>
                    Показать список опросов
                  </Button>
                </Stack.Item>
              )}
              <Stack.Item grow>
                <RightPane
                  selected={selected_poll}
                  pendingRef={pendingRef}
                  interactionLocked={interactionLocked}
                />
              </Stack.Item>
            </Stack>
          </Stack.Item>
        </Stack>
      </Window.Content>
    </Window>
  );
};

const RightPane = ({
  selected,
  pendingRef,
  interactionLocked,
}: {
  selected: SelectedPoll | null;
  pendingRef: string | null;
  interactionLocked: boolean;
}) => {
  if (pendingRef && (!selected || selected.ref !== pendingRef)) {
    return <LoadingState />;
  }
  if (selected) {
    return (
      <PollDetails
        key={selected.ref}
        poll={selected}
        interactionLocked={interactionLocked}
      />
    );
  }
  return <EmptyState />;
};

const EmptyState = () => (
  <Section fill>
    <Stack fill vertical align="center" justify="center">
      <Stack.Item>
        <Icon name="square-poll-vertical" size={4} color="label" />
      </Stack.Item>
      <Stack.Item>
        <Box color="label" fontSize={1.2}>
          Выберите опрос слева, чтобы увидеть детали.
        </Box>
      </Stack.Item>
    </Stack>
  </Section>
);

const LoadingState = () => (
  <Section fill>
    <Stack fill vertical align="center" justify="center">
      <Stack.Item>
        <Icon name="spinner" spin size={3} color="label" />
      </Stack.Item>
      <Stack.Item>
        <Box color="label">Загрузка опроса...</Box>
      </Stack.Item>
    </Stack>
  </Section>
);

const PollDetails = ({
  poll,
  interactionLocked,
}: {
  poll: SelectedPoll;
  interactionLocked: boolean;
}) => {
  const { act, data } = useBackend<Data>();
  const canVote = !poll.finished && !poll.future_poll;
  const [activeTab, setActiveTab] = useState<TabId>(
    canVote ? 'vote' : 'results',
  );

  // useRef so we can skip initial draft creation on each call
  const initialDraftRef = useRef<VoteDraft | null>(null);
  if (initialDraftRef.current === null) {
    initialDraftRef.current = makeInitialDraft(poll);
  }
  const [draft, setDraft] = useState<VoteDraft>(initialDraftRef.current);
  const [confirmingText, setConfirmingText] = useState(false);

  const submitCheck = buildVotePayload(poll.poll_type, draft);

  const doSubmit = () => {
    if (!submitCheck.ready || data.ui_busy) return;
    act('vote', { poll_ref: poll.ref, ...submitCheck.payload });
    setConfirmingText(false);
  };

  const handleSubmitClick = () => {
    if (!submitCheck.ready || interactionLocked) return;
    if (poll.poll_type === 'TEXT' && !confirmingText) {
      setConfirmingText(true);
      return;
    }
    doSubmit();
  };

  return (
    <Stack fill vertical>
      <Stack.Item>
        <Section>
          <Stack align="center">
            <Stack.Item grow>
              <Box fontSize={1.3} bold>
                {poll.question}
              </Box>
              {poll.subtitle && (
                <Box color="label" preserveWhitespace mt={0.5}>
                  {poll.subtitle}
                </Box>
              )}
            </Stack.Item>
            <Stack.Item>
              {poll.finished ? (
                <Box color="bad">
                  <Icon name="lock" /> Завершён
                </Box>
              ) : poll.future_poll ? (
                <Box color="average">
                  <Icon name="hourglass-start" />{' '}
                  {poll.start_datetime
                    ? `Старт: ${poll.start_datetime}`
                    : 'Ещё не начался'}
                </Box>
              ) : (
                <Box color="good">
                  <Icon name="clock" /> Активен
                </Box>
              )}
            </Stack.Item>
          </Stack>
        </Section>
      </Stack.Item>
      <Stack.Item style={interactionLocked ? uiLockedGreystyle : undefined}>
        <Tabs>
          <Tabs.Tab
            icon="check-to-slot"
            selected={activeTab === 'vote'}
            onClick={() => !interactionLocked && setActiveTab('vote')}
          >
            Голосование
          </Tabs.Tab>
          <Tabs.Tab
            icon="chart-column"
            selected={activeTab === 'results'}
            onClick={() => !interactionLocked && setActiveTab('results')}
          >
            Результаты
          </Tabs.Tab>
        </Tabs>
      </Stack.Item>
      <Stack.Item grow>
        <Section fill scrollable>
          {activeTab === 'vote' ? (
            canVote ? (
              <VoteTab
                poll={poll}
                draft={draft}
                setDraft={setDraft}
                controlsLocked={interactionLocked}
              />
            ) : poll.future_poll ? (
              <Box color="label" textAlign="center" mt={2}>
                <Icon name="hourglass-start" />{' '}
                {poll.start_datetime
                  ? `Опрос ещё не начался. Старт: ${poll.start_datetime}`
                  : 'Опрос ещё не начался. Время старта не указано.'}
              </Box>
            ) : (
              <Box color="label" textAlign="center" mt={2}>
                <Icon name="hourglass-end" /> Опрос завершён, голосование
                недоступно.
              </Box>
            )
          ) : (
            <ResultsTab poll={poll} />
          )}
        </Section>
      </Stack.Item>
      {activeTab === 'vote' && canVote && (
        <Stack.Item>
          <Section>
            <Stack vertical>
              {confirmingText && (
                <Stack.Item>
                  <Box color="average" textAlign="center">
                    <Icon name="triangle-exclamation" /> Вы уверены, что ваш
                    ответ соответствует правилам проекта?
                  </Box>
                </Stack.Item>
              )}
              <Stack.Item>
                <Stack justify="center">
                  {confirmingText && (
                    <Stack.Item>
                      <Button
                        icon="xmark"
                        style={
                          interactionLocked ? uiLockedGreystyle : undefined
                        }
                        onClick={() =>
                          !interactionLocked && setConfirmingText(false)
                        }
                      >
                        Отмена
                      </Button>
                    </Stack.Item>
                  )}
                  <Stack.Item>
                    <Button
                      icon={confirmingText ? 'check' : 'paper-plane'}
                      color={submitCheck.ready ? 'good' : 'default'}
                      style={
                        !submitCheck.ready || interactionLocked
                          ? uiLockedGreystyle
                          : undefined
                      }
                      tooltip={
                        !submitCheck.ready && 'reason' in submitCheck
                          ? submitCheck.reason
                          : interactionLocked
                            ? 'Ожидание ответа сервера…'
                            : undefined
                      }
                      onClick={handleSubmitClick}
                    >
                      {confirmingText ? 'Подтвердить и отправить' : 'Отправить'}
                    </Button>
                  </Stack.Item>
                </Stack>
              </Stack.Item>
            </Stack>
          </Section>
        </Stack.Item>
      )}
    </Stack>
  );
};
