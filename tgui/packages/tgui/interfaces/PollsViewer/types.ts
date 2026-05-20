import type { BooleanLike } from 'tgui-core/react';

export type PollType = 'OPTION' | 'TEXT' | 'NUMVAL' | 'MULTICHOICE';

export type PollBrief = {
  id: number;
  ref: string;
  question: string;
  subtitle: string | null;
  poll_type: PollType;
  start_datetime: string | null;
  end_datetime: string | null;
  voted: BooleanLike;
  allow_revoting: BooleanLike;
  admin_only: BooleanLike;
  future_poll: BooleanLike;
  finished: BooleanLike;
  total_votes: number;
};

export type PollOption = {
  id: number;
  ref: string;
  text: string;
  min_val: number | null;
  max_val: number | null;
  desc_min: string | null;
  desc_mid: string | null;
  desc_max: string | null;
};

export type UserVotes = {
  option_id?: number;
  ratings?: Record<string, number>;
  option_ids?: number[];
  ranking?: number[];
  text?: string;
};

export type OptionResult = {
  option_id: number;
  text: string;
  votes: number;
};

export type RatingDistribution = {
  value: number;
  votes: number;
};

export type RatingOptionResult = {
  option_id: number;
  text: string;
  min_val: number;
  max_val: number;
  desc_min: string | null;
  desc_mid: string | null;
  desc_max: string | null;
  distribution: RatingDistribution[];
  total_voters: number;
  average: number;
};

export type TextReply = {
  id?: number;
  text: string;
  datetime: string;
};

export type OptionPollResults = {
  type: 'OPTION';
  total_voters: number;
  options: OptionResult[];
  respondent_ckeys?: string[];
};

export type MultiChoicePollResults = {
  type: 'MULTICHOICE';
  total_voters: number;
  total_votes_sum: number;
  options: OptionResult[];
  respondent_ckeys?: string[];
};

export type RatingPollResults = {
  type: 'NUMVAL';
  options: RatingOptionResult[];
  respondent_ckeys?: string[];
};

export type TextPollResults = {
  type: 'TEXT';
  replies: TextReply[];
};

export type PollResults =
  | OptionPollResults
  | MultiChoicePollResults
  | RatingPollResults
  | TextPollResults;

export type SelectedPoll = {
  id: number;
  ref: string;
  question: string;
  subtitle: string | null;
  created_by?: string | null;
  poll_type: PollType;
  start_datetime: string | null;
  end_datetime: string | null;
  future_poll?: BooleanLike;
  allow_revoting: BooleanLike;
  dont_show: BooleanLike;
  options_allowed: number | null;
  total_votes: number;
  options: PollOption[];
  finished: BooleanLike;
  can_view_results: BooleanLike;
  user_votes: UserVotes;
  results: PollResults | null;
};

export type Data = {
  polls?: PollBrief[];
  is_pollster?: BooleanLike;
  ckey?: string | null;
  selected_poll?: SelectedPoll | null;
  // Server side lock while poll UI runs a DB update
  ui_busy?: BooleanLike;
};
