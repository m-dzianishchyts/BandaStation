import type { BooleanLike } from 'tgui-core/react';

export type PollType = 'OPTION' | 'TEXT' | 'NUMVAL' | 'MULTICHOICE' | 'IRV';

export type PollBrief = {
  id: number;
  ref: string;
  question: string;
  subtitle: string | null;
  poll_type: PollType;
  start_datetime: string | null;
  end_datetime: string;
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
  desc_min: string;
  desc_mid: string;
  desc_max: string;
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
  desc_min: string;
  desc_mid: string;
  desc_max: string;
  distribution: RatingDistribution[];
  total_voters: number;
  average: number;
};

export type TextReply = {
  id?: number;
  text: string;
  datetime: string;
};

export type PollResults = {
  type: PollType;
  total_voters?: number;
  total_votes_sum?: number;
  options?: OptionResult[] | RatingOptionResult[];
  replies?: TextReply[];
  respondent_ckeys?: string[];
  note?: string;
};

export type SelectedPoll = {
  id: number;
  ref: string;
  question: string;
  subtitle: string | null;
  created_by?: string | null;
  poll_type: PollType;
  start_datetime: string | null;
  end_datetime: string;
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
  polls: PollBrief[];
  is_pollster: BooleanLike;
  ckey: string;
  selected_poll: SelectedPoll | null;
  // Server side lock while poll UI runs a DB update
  ui_busy?: BooleanLike;
};
