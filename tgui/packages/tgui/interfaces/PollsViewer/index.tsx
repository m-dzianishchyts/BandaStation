import { useEffect, useState } from 'react';
import { Box, Button, Icon, Section, Stack, Tabs } from 'tgui-core/components';

import { useBackend } from '../../backend';
import { Window } from '../../layouts';
import { PollList } from './PollList';
import { ResultsTab } from './ResultsTab';
import type { Data, SelectedPoll } from './types';
import { VoteTab } from './VoteTab';
import {
  buildVotePayload,
  isVoteSubmitBlocked,
  makeInitialDraft,
} from './voteDraft';

function formatPollTimestamp(value: string | null | undefined) {
	if (!value) {
		return 'не указано';
	}
	return new Date(`${value} UTC`).toLocaleString([], {
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
	});
}

type TabId = 'vote' | 'results';

const uiLockedGreystyle = {
  opacity: 0.52,
  filter: 'grayscale(0.38)',
} as const;

export function PollsViewer() {
  const { act, data } = useBackend<Data>();
  const selected_poll = data.selected_poll ?? null;
  const [listCollapsed, setListCollapsed] = useState(false);
  const [pendingRef, setPendingRef] = useState<string | null>(null);
  const [pendingSelectionWasBusy, setPendingSelectionWasBusy] = useState(false);

  useEffect(() => {
    if (!pendingRef) return;
    if (!selected_poll) return;
    if (selected_poll.ref === pendingRef) {
      setPendingRef(null);
      setPendingSelectionWasBusy(false);
      return;
    }
    if (
      pendingRef.startsWith('archived:') &&
      Number(pendingRef.slice('archived:'.length)) === selected_poll.id
    ) {
      setPendingRef(null);
      setPendingSelectionWasBusy(false);
    }
  }, [selected_poll?.id, selected_poll?.ref, pendingRef]);

  useEffect(() => {
    if (!pendingRef) return;
    if (data.ui_busy) {
      setPendingSelectionWasBusy(true);
      return;
    }
    if (pendingSelectionWasBusy && !selected_poll) {
      setPendingRef(null);
      setPendingSelectionWasBusy(false);
    }
  }, [data.ui_busy, selected_poll, pendingRef, pendingSelectionWasBusy]);

  const activeRef = pendingRef ?? selected_poll?.ref ?? undefined;
  const backendBusy = Boolean(data.ui_busy);
  const selectionLocked = backendBusy || pendingRef !== null;
  const interactionLocked = backendBusy;

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
                interactionLocked={selectionLocked}
                onSelect={(ref) => {
                  setPendingRef(ref);
                  setPendingSelectionWasBusy(false);
                }}
                onCollapse={() => setListCollapsed(true)}
                onOpenPollManagement={() => act('open_poll_list_panel')}
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

function RightPane({
  selected,
  pendingRef,
  interactionLocked,
}: {
  selected: SelectedPoll | null;
  pendingRef: string | null;
  interactionLocked: boolean;
}) {
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

function EmptyState() {
  return (
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
}

function LoadingState() {
  return (
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
}

function PollDetails({
  poll,
  interactionLocked,
}: {
  poll: SelectedPoll;
  interactionLocked: boolean;
}) {
  const { act, data } = useBackend<Data>();
  const isPollster = !!data.is_pollster;
  const canVote = !poll.finished && !poll.future_poll;
  const [activeTab, setActiveTab] = useState<TabId>(
    canVote ? 'vote' : 'results',
  );

  const [draft, setDraft] = useState(() => makeInitialDraft(poll));
  const [confirmingText, setConfirmingText] = useState(false);

  const submitCheck = buildVotePayload(poll.poll_type, draft);
  const ballotLockedNoRevote = isVoteSubmitBlocked(poll);

  function doSubmit() {
    if (
      ballotLockedNoRevote ||
      !submitCheck.ready ||
      data.ui_busy ||
      interactionLocked
    )
      return;
    act('vote', { poll_ref: poll.ref, ...submitCheck.payload });
    setConfirmingText(false);
  }

  function handleSubmitClick() {
    if (
      ballotLockedNoRevote ||
      !submitCheck.ready ||
      interactionLocked
    )
      return;
    if (poll.poll_type === 'TEXT' && !confirmingText) {
      setConfirmingText(true);
      return;
    }
    doSubmit();
  }

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
              <Stack vertical align="flex-end">
                <Stack.Item>
                  {poll.finished ? (
                    <Box color="bad">
                      <Icon name="lock" /> Завершён
                    </Box>
                  ) : poll.future_poll ? (
                    <Box color="average">
                      <Icon name="hourglass-start" />{' '}
                      {poll.start_datetime
                        ? `Старт: ${formatPollTimestamp(poll.start_datetime)}`
                        : 'Ещё не начался'}
                    </Box>
                  ) : (
                    <Box color="good">
                      <Icon name="clock" /> Активен
                    </Box>
                  )}
                </Stack.Item>
                <Stack.Item>
                  <Box color="label" fontSize={0.85} mt={0.5} preserveWhitespace>
                    Автор: {poll.created_by ?? 'не указано'}
                  </Box>
                </Stack.Item>
              </Stack>
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
            <ResultsTab poll={poll} isPollster={isPollster} />
          )}
        </Section>
      </Stack.Item>
      {activeTab === 'vote' && canVote && !ballotLockedNoRevote && (
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
                      disabled={
                        interactionLocked ||
                        data.ui_busy ||
                        ballotLockedNoRevote ||
                        !submitCheck.ready
                      }
                      style={
                        !submitCheck.ready ||
                        interactionLocked ||
                        ballotLockedNoRevote ||
                        data.ui_busy
                          ? uiLockedGreystyle
                          : undefined
                      }
                      tooltip={
                        ballotLockedNoRevote
                          ? undefined
                          : !submitCheck.ready && 'reason' in submitCheck
                            ? submitCheck.reason
                            : interactionLocked || data.ui_busy
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
}
