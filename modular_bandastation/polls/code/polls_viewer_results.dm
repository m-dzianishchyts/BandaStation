/**
 * Poll results calculation, mirrors Statbus.
 */
/datum/polls_viewer/proc/calculate_poll_results(datum/poll_question/poll, include_admin_vote_data = FALSE)
	if(!SSdbcore.Connect())
		return null

	var/list/result = null
	switch(poll.poll_type)
		if(POLLTYPE_OPTION)
			result = tally_option_poll(poll)
		if(POLLTYPE_MULTI)
			result = tally_multi_poll(poll)
		if(POLLTYPE_RATING)
			result = tally_rating_poll(poll)
		if(POLLTYPE_TEXT)
			result = tally_text_poll(poll, include_admin_vote_data)
		if(POLLTYPE_IRV)
			result = list(
				"type" = POLLTYPE_IRV,
				"note" = "Этот тип опроса не поддерживается.",
			)
	if(include_admin_vote_data && result && (poll.poll_type == POLLTYPE_OPTION || poll.poll_type == POLLTYPE_MULTI || poll.poll_type == POLLTYPE_RATING))
		result["respondent_ckeys"] = fetch_vote_respondent_ckeys(poll)
	return result

/**
 * OPTION: unique votes by option_id, sorted descending.
 * Each ckey is counted once
 */
/datum/polls_viewer/proc/tally_option_poll(datum/poll_question/poll)
	var/list/result = list(
		"type" = POLLTYPE_OPTION,
		"total_voters" = 0,
		"options" = list(),
	)

	var/list/counts = list()
	for(var/datum/poll_option/option as anything in poll.options)
		counts["[option.option_id]"] = list(
			"option_id" = option.option_id,
			"text" = option.text,
			"votes" = 0,
		)

	var/datum/db_query/query = SSdbcore.NewQuery(
		"SELECT optionid, COUNT(DISTINCT ckey) FROM [format_table_name("poll_vote")] WHERE pollid = :poll_id AND deleted = 0 GROUP BY optionid",
		list("poll_id" = poll.poll_id)
	)
	if(!query.warn_execute())
		qdel(query)
		return result

	var/total = 0
	while(query.NextRow())
		var/option_id_key = "[query.item[1]]"
		var/vote_count = text2num(query.item[2])
		if(counts[option_id_key])
			counts[option_id_key]["votes"] = vote_count
		total += vote_count
	qdel(query)

	result["total_voters"] = total
	for(var/key in counts)
		result["options"] += list(counts[key])

	sortTim(result["options"], GLOBAL_PROC_REF(cmp_poll_result_votes_desc))
	return result

/**
 * MULTI: each ckey+option pair counts as one vote.
 * Total voter count is DISTINCT ckey
 */
/datum/polls_viewer/proc/tally_multi_poll(datum/poll_question/poll)
	var/list/result = list(
		"type" = POLLTYPE_MULTI,
		"total_voters" = 0,
		"total_votes_sum" = 0,
		"options" = list(),
	)

	var/list/counts = list()
	for(var/datum/poll_option/option as anything in poll.options)
		counts["[option.option_id]"] = list(
			"option_id" = option.option_id,
			"text" = option.text,
			"votes" = 0,
		)

	var/datum/db_query/query_options = SSdbcore.NewQuery(
		"SELECT optionid, COUNT(DISTINCT ckey) FROM [format_table_name("poll_vote")] WHERE pollid = :poll_id AND deleted = 0 GROUP BY optionid",
		list("poll_id" = poll.poll_id)
	)
	var/total_votes_sum = 0
	if(query_options.warn_execute())
		while(query_options.NextRow())
			var/option_id_key = "[query_options.item[1]]"
			var/votes = text2num(query_options.item[2])
			if(counts[option_id_key])
				counts[option_id_key]["votes"] = votes
			total_votes_sum += votes
	qdel(query_options)
	result["total_votes_sum"] = total_votes_sum

	var/datum/db_query/query_total = SSdbcore.NewQuery(
		"SELECT COUNT(DISTINCT ckey) FROM [format_table_name("poll_vote")] WHERE pollid = :poll_id AND deleted = 0",
		list("poll_id" = poll.poll_id)
	)
	if(query_total.warn_execute() && query_total.NextRow())
		result["total_voters"] = text2num(query_total.item[1])
	qdel(query_total)

	for(var/key in counts)
		result["options"] += list(counts[key])
	sortTim(result["options"], GLOBAL_PROC_REF(cmp_poll_result_votes_desc))
	return result

/**
 * RATING: vote distribution per option by rating value (min..max)
 */
/datum/polls_viewer/proc/tally_rating_poll(datum/poll_question/poll)
	var/list/result = list(
		"type" = POLLTYPE_RATING,
		"options" = list(),
	)

	// option_id string -> rating string -> vote count
	var/list/votes_by_option_rating = list()
	var/datum/db_query/query = SSdbcore.NewQuery(
		"SELECT optionid, rating, COUNT(DISTINCT ckey) FROM [format_table_name("poll_vote")] WHERE pollid = :poll_id AND deleted = 0 AND rating IS NOT NULL GROUP BY optionid, rating",
		list("poll_id" = poll.poll_id)
	)
	if(query.warn_execute())
		while(query.NextRow())
			var/option_key = "[text2num(query.item[1])]"
			var/rating = text2num(query.item[2])
			var/count = text2num(query.item[3])
			if(!votes_by_option_rating[option_key])
				votes_by_option_rating[option_key] = list()
			var/list/rating_row = votes_by_option_rating[option_key]
			rating_row["[rating]"] = count
	qdel(query)

	for(var/datum/poll_option/option as anything in poll.options)
		var/min_v = option.min_val
		var/max_v = option.max_val
		var/option_key = "[option.option_id]"
		var/list/rating_counts = votes_by_option_rating[option_key] || list()
		var/total_voters = 0
		var/sum = 0
		var/list/distribution = list()
		for(var/i in min_v to max_v)
			var/raw_count = rating_counts["[i]"]
			var/bucket_votes = isnull(raw_count) ? 0 : text2num(raw_count)
			distribution += list(list(
				"value" = i,
				"votes" = bucket_votes,
			))
			total_voters += bucket_votes
			sum += i * bucket_votes

		result["options"] += list(list(
			"option_id" = option.option_id,
			"text" = option.text,
			"min_val" = min_v,
			"max_val" = max_v,
			"desc_min" = option.desc_min,
			"desc_mid" = option.desc_mid,
			"desc_max" = option.desc_max,
			"distribution" = distribution,
			"total_voters" = total_voters,
			"average" = total_voters > 0 ? round(sum / total_voters, 0.01) : 0,
		))

	return result


/// Anonymous replies with optional row ids for admins
/datum/polls_viewer/proc/tally_text_poll(datum/poll_question/poll, include_reply_ids = FALSE)
	var/list/result = list(
		"type" = POLLTYPE_TEXT,
		"replies" = list(),
	)

	var/sql = include_reply_ids ? {"
			SELECT id, replytext, datetime FROM [format_table_name("poll_textreply")] WHERE pollid = :poll_id AND deleted = 0 ORDER BY datetime DESC
			"} : {"
			SELECT replytext, datetime FROM [format_table_name("poll_textreply")] WHERE pollid = :poll_id AND deleted = 0 ORDER BY datetime DESC
			"}
	var/datum/db_query/query = SSdbcore.NewQuery(sql, list("poll_id" = poll.poll_id))
	if(!query.warn_execute())
		qdel(query)
		return result

	while(query.NextRow())
		var/list/card = include_reply_ids ? list(
				"id" = text2num(query.item[1]),
				"text" = query.item[2],
				"datetime" = query.item[3],
			) : list(
				"text" = query.item[1],
				"datetime" = query.item[2],
			)
		result["replies"] += list(card)
	qdel(query)

	return result

/datum/polls_viewer/proc/fetch_vote_respondent_ckeys(datum/poll_question/poll)
	var/list/out = list()
	if(!poll?.poll_id || poll.poll_type == POLLTYPE_TEXT || !SSdbcore.Connect())
		return out
	var/datum/db_query/query = SSdbcore.NewQuery(
		"SELECT DISTINCT ckey FROM [format_table_name("poll_vote")] WHERE pollid = :poll_id AND deleted = 0 ORDER BY ckey ASC",
		list("poll_id" = poll.poll_id)
	)
	if(query.warn_execute())
		while(query.NextRow())
			var/ckey_found = "[query.item[1]]"
			if(ckey_found)
				out += ckey_found
	qdel(query)
	return out

/// Comparator for descending vote sort.
/proc/cmp_poll_result_votes_desc(list/a, list/b)
	return b["votes"] - a["votes"]
