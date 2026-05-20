/**
 * Подсчёт результатов опроса. Логика повторяет Statbus Tally-сервисы.
 */
/datum/polls_viewer/proc/calculate_poll_results(datum/poll_question/poll)
	if(!SSdbcore.Connect())
		return null

	switch(poll.poll_type)
		if(POLLTYPE_OPTION)
			return tally_option_poll(poll)
		if(POLLTYPE_MULTI)
			return tally_multi_poll(poll)
		if(POLLTYPE_RATING)
			return tally_rating_poll(poll)
		if(POLLTYPE_TEXT)
			return tally_text_poll(poll)
		if(POLLTYPE_IRV)
			return tally_irv_poll(poll)
	return null

/**
 * OPTION: уникальные голоса на option_id, сортируем по убыванию.
 * Каждый ckey учитывается один раз (на случай, если в БД остались дубли).
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
 * MULTI: каждое сочетание ckey+option = 1 голос. Общее число голосующих — DISTINCT ckey.
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
 * RATING: для каждой опции — распределение голосов по значениям rating (от min до max).
 */
/datum/polls_viewer/proc/tally_rating_poll(datum/poll_question/poll)
	var/list/result = list(
		"type" = POLLTYPE_RATING,
		"options" = list(),
	)

	for(var/datum/poll_option/option as anything in poll.options)
		var/list/ratings_dist = list()
		var/min_v = option.min_val
		var/max_v = option.max_val
		// Инициализируем все возможные значения нулями
		for(var/i in min_v to max_v)
			ratings_dist["[i]"] = 0

		var/datum/db_query/query = SSdbcore.NewQuery(
			"SELECT rating, COUNT(DISTINCT ckey) FROM [format_table_name("poll_vote")] WHERE pollid = :poll_id AND optionid = :option_id AND deleted = 0 AND rating IS NOT NULL GROUP BY rating",
			list("poll_id" = poll.poll_id, "option_id" = option.option_id)
		)

		var/total_voters = 0
		var/sum = 0
		if(query.warn_execute())
			while(query.NextRow())
				var/rating = text2num(query.item[1])
				var/count = text2num(query.item[2])
				ratings_dist["[rating]"] = count
				total_voters += count
				sum += rating * count
		qdel(query)

		var/list/distribution = list()
		for(var/i in min_v to max_v)
			distribution += list(list(
				"value" = i,
				"votes" = ratings_dist["[i]"],
			))

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

/**
 * TEXT: анонимный список ответов (ckey не передаётся в UI, чтобы обеспечить полную анонимность).
 */
/datum/polls_viewer/proc/tally_text_poll(datum/poll_question/poll)
	var/list/result = list(
		"type" = POLLTYPE_TEXT,
		"replies" = list(),
	)

	// ckey из результатов намеренно не передаётся, чтобы не деанонимизировать игроков ни для кого.
	var/datum/db_query/query = SSdbcore.NewQuery(
		"SELECT replytext, datetime FROM [format_table_name("poll_textreply")] WHERE pollid = :poll_id AND deleted = 0 ORDER BY datetime DESC",
		list("poll_id" = poll.poll_id)
	)
	if(!query.warn_execute())
		qdel(query)
		return result

	while(query.NextRow())
		result["replies"] += list(list(
			"text" = query.item[1],
			"datetime" = query.item[2],
		))
	qdel(query)

	return result

/**
 * IRV: упрощённый подсчёт первых предпочтений.
 * Полноценный Condorcet/IRV алгоритм лежит на Statbus — здесь показываем первый выбор каждого голосующего.
 */
/datum/polls_viewer/proc/tally_irv_poll(datum/poll_question/poll)
	var/list/result = list(
		"type" = POLLTYPE_IRV,
		"total_voters" = 0,
		"options" = list(),
		"note" = "Первый выбор каждого голосующего. Финальный результат рассчитывается внешним сервисом (Statbus).",
	)

	var/list/counts = list()
	for(var/datum/poll_option/option as anything in poll.options)
		counts["[option.option_id]"] = list(
			"option_id" = option.option_id,
			"text" = option.text,
			"votes" = 0,
		)

	// Берём минимальный id (первое предпочтение) для каждого ckey
	var/datum/db_query/query = SSdbcore.NewQuery({"
		SELECT optionid, COUNT(*) FROM (
			SELECT ckey, MIN(id) AS first_vote
			FROM [format_table_name("poll_vote")]
			WHERE pollid = :poll_id AND deleted = 0
			GROUP BY ckey
		) AS firsts
		JOIN [format_table_name("poll_vote")] AS pv ON pv.id = firsts.first_vote
		GROUP BY pv.optionid
	"}, list("poll_id" = poll.poll_id))
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

/// Сравнение для сортировки опций по убыванию голосов.
/proc/cmp_poll_result_votes_desc(list/a, list/b)
	return b["votes"] - a["votes"]
