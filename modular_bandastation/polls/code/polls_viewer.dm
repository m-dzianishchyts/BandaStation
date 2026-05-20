/**
 * Современный TGUI-просмотрщик опросов. Один общий datum на весь сервер.
 */
GLOBAL_DATUM_INIT(polls_viewer, /datum/polls_viewer, new)

/datum/polls_viewer
	/// Текущий выбранный опрос для каждого пользователя: ckey -> datum/poll_question
	var/list/selected_poll_by_ckey = list()
	/// Кэш завершённых опросов, загружаемых из БД по запросу админов: poll_id -> datum/poll_question
	var/list/archived_polls_cache = list()

/datum/polls_viewer/ui_state(mob/user)
	return GLOB.always_state

/datum/polls_viewer/ui_close(mob/user)
	. = ..()
	if(user.client?.ckey)
		selected_poll_by_ckey -= user.client.ckey

/datum/polls_viewer/ui_interact(mob/user, datum/tgui/ui)
	ui = SStgui.try_update_ui(user, src, ui)
	if(!ui)
		ui = new(user, src, "PollsViewer")
		ui.open()

/// ui_data обновляется каждый тик TGUI и должен быть максимально легковесным.
/// Все тяжёлые данные уходят в ui_static_data и обновляются вручную через update_static_data().
/datum/polls_viewer/ui_data(mob/user)
	return list()

/datum/polls_viewer/ui_static_data(mob/user)
	var/list/data = list()
	var/ckey = user.client?.ckey
	var/is_pollster = check_rights_for(user.client, R_POLL)

	// Единоразово загружаем, в каких опросах пользователь уже участвовал.
	var/list/voted_poll_ids = get_voted_poll_ids(ckey)

	var/list/polls_data = list()
	for(var/datum/poll_question/poll as anything in GLOB.polls)
		if(poll.admin_only && !is_pollster)
			continue
		if(poll.future_poll && !is_pollster)
			continue

		polls_data += list(list(
			"id" = poll.poll_id,
			"ref" = REF(poll),
			"question" = poll.question,
			"subtitle" = poll.subtitle,
			"poll_type" = poll.poll_type,
			"start_datetime" = poll.start_datetime,
			"end_datetime" = poll.end_datetime,
			"voted" = ("[poll.poll_id]" in voted_poll_ids),
			"allow_revoting" = !!poll.allow_revoting,
			"admin_only" = !!poll.admin_only,
			"future_poll" = !!poll.future_poll,
			"finished" = FALSE,
			"total_votes" = poll.poll_votes,
		))

	// Админам дополнительно подгружаем карточки архивных (завершённых) опросов напрямую из БД.
	if(is_pollster)
		for(var/list/archived in load_archived_polls_brief())
			polls_data += list(archived)

	data["polls"] = polls_data
	data["is_pollster"] = is_pollster
	data["ckey"] = ckey

	var/datum/poll_question/selected = selected_poll_by_ckey[ckey]
	if(selected)
		data["selected_poll"] = build_selected_poll_data(selected, user)
	else
		data["selected_poll"] = null

	return data

/**
 * Загружает brief-карточки завершённых опросов для админского архива.
 * Опции и полные данные подгружаются только при выборе конкретного опроса (см. ensure_archived_poll_loaded).
 */
/datum/polls_viewer/proc/load_archived_polls_brief()
	var/list/result = list()
	if(!SSdbcore.Connect())
		return result
	var/datum/db_query/query = SSdbcore.NewQuery({"
		SELECT q.id, q.polltype, q.starttime, q.endtime, q.question, q.subtitle, q.adminonly, q.allow_revoting,
			IF(q.polltype='TEXT',
				(SELECT COUNT(ckey) FROM [format_table_name("poll_textreply")] AS t WHERE t.pollid = q.id AND t.deleted = 0),
				(SELECT COUNT(DISTINCT ckey) FROM [format_table_name("poll_vote")] AS v WHERE v.pollid = q.id AND v.deleted = 0)
			)
		FROM [format_table_name("poll_question")] AS q
		WHERE q.endtime < NOW() AND q.deleted = 0
		ORDER BY q.endtime DESC
		LIMIT 50
	"})
	if(query.warn_execute())
		while(query.NextRow())
			var/poll_id = text2num(query.item[1])
			result += list(list(
				"id" = poll_id,
				"ref" = "archived:[poll_id]",
				"question" = query.item[5],
				"subtitle" = query.item[6],
				"poll_type" = query.item[2],
				"start_datetime" = query.item[3],
				"end_datetime" = query.item[4],
				"voted" = FALSE,
				"allow_revoting" = text2num(query.item[8]),
				"admin_only" = text2num(query.item[7]),
				"future_poll" = FALSE,
				"finished" = TRUE,
				"total_votes" = text2num(query.item[9]),
			))
	qdel(query)
	return result

/**
 * Гарантирует, что архивный опрос загружен в кэш. Возвращает datum/poll_question или null.
 */
/datum/polls_viewer/proc/ensure_archived_poll_loaded(poll_id)
	if(archived_polls_cache["[poll_id]"])
		return archived_polls_cache["[poll_id]"]
	if(!SSdbcore.Connect())
		return null
	var/datum/db_query/query = SSdbcore.NewQuery(
		"SELECT id, polltype, starttime, endtime, question, subtitle, adminonly, multiplechoiceoptions, dontshow, allow_revoting FROM [format_table_name("poll_question")] WHERE id = :poll_id AND deleted = 0",
		list("poll_id" = poll_id)
	)
	if(!query.warn_execute() || !query.NextRow())
		qdel(query)
		return null
	// Создаём полноценный datum (не добавляя в GLOB.polls, чтобы не ломать игровую логику).
	var/datum/poll_question/poll = new(
		query.item[1], query.item[2], query.item[3], query.item[4], query.item[5], query.item[6],
		query.item[7], query.item[8], query.item[9], query.item[10], 0, null, 0, TRUE
	)
	qdel(query)
	// Убираем из GLOB.polls -- datum сам себя туда добавил в New().
	GLOB.polls -= poll

	var/datum/db_query/query_options = SSdbcore.NewQuery(
		"SELECT id, text, minval, maxval, descmin, descmid, descmax, default_percentage_calc FROM [format_table_name("poll_option")] WHERE pollid = :poll_id",
		list("poll_id" = poll_id)
	)
	if(query_options.warn_execute())
		while(query_options.NextRow())
			var/datum/poll_option/option = new(
				query_options.item[1], query_options.item[2], query_options.item[3], query_options.item[4],
				query_options.item[5], query_options.item[6], query_options.item[7], query_options.item[8]
			)
			poll.options += option
	qdel(query_options)

	archived_polls_cache["[poll_id]"] = poll
	return poll

/datum/polls_viewer/proc/get_voted_poll_ids(ckey)
	var/list/result = list()
	if(!ckey || !SSdbcore.Connect())
		return result

	var/datum/db_query/query = SSdbcore.NewQuery(
		"SELECT DISTINCT pollid FROM [format_table_name("poll_vote")] WHERE ckey = :ckey AND deleted = 0",
		list("ckey" = ckey)
	)
	if(query.warn_execute())
		while(query.NextRow())
			result["[query.item[1]]"] = TRUE
	qdel(query)

	var/datum/db_query/query_text = SSdbcore.NewQuery(
		"SELECT DISTINCT pollid FROM [format_table_name("poll_textreply")] WHERE ckey = :ckey AND deleted = 0",
		list("ckey" = ckey)
	)
	if(query_text.warn_execute())
		while(query_text.NextRow())
			result["[query_text.item[1]]"] = TRUE
	qdel(query_text)

	return result

/**
 * Может ли пользователь видеть результаты данного опроса?
 * Админ — всегда. Другие — если опрос закончен либо dont_show = FALSE.
 */
/datum/polls_viewer/proc/can_view_results(datum/poll_question/poll, mob/user)
	if(user.client?.holder)
		return TRUE
	// Админы прячут результаты активных опросов при dont_show
	if(poll.dont_show && !is_poll_finished(poll))
		return FALSE
	return TRUE

/**
 * Проверяет, закончен ли опрос по end_datetime.
 */
/datum/polls_viewer/proc/is_poll_finished(datum/poll_question/poll)
	if(!poll.end_datetime)
		return FALSE
	if(!SSdbcore.Connect())
		return FALSE
	var/datum/db_query/query = SSdbcore.NewQuery(
		"SELECT NOW() > :end_dt",
		list("end_dt" = poll.end_datetime)
	)
	if(!query.warn_execute())
		qdel(query)
		return FALSE
	var/finished = FALSE
	if(query.NextRow())
		finished = text2num(query.item[1])
	qdel(query)
	return finished

/**
 * Собирает полные данные о выбранном опросе: опции, пользовательские голоса, результаты.
 */
/datum/polls_viewer/proc/build_selected_poll_data(datum/poll_question/poll, mob/user)
	var/list/data = list(
		"id" = poll.poll_id,
		"ref" = REF(poll),
		"question" = poll.question,
		"subtitle" = poll.subtitle,
		"poll_type" = poll.poll_type,
		"start_datetime" = poll.start_datetime,
		"end_datetime" = poll.end_datetime,
		"allow_revoting" = !!poll.allow_revoting,
		"dont_show" = !!poll.dont_show,
		"options_allowed" = poll.options_allowed,
		"total_votes" = poll.poll_votes,
	)

	var/list/options_data = list()
	for(var/datum/poll_option/option as anything in poll.options)
		options_data += list(list(
			"id" = option.option_id,
			"ref" = REF(option),
			"text" = option.text,
			"min_val" = option.min_val,
			"max_val" = option.max_val,
			"desc_min" = option.desc_min,
			"desc_mid" = option.desc_mid,
			"desc_max" = option.desc_max,
		))
	data["options"] = options_data

	data["finished"] = is_poll_finished(poll)
	data["can_view_results"] = can_view_results(poll, user)
	data["user_votes"] = get_user_votes(poll, user.client?.ckey)

	if(data["can_view_results"])
		data["results"] = calculate_poll_results(poll)
	else
		data["results"] = null

	return data

/**
 * Возвращает список текущих голосов пользователя для указанного опроса.
 * Для OPTION/TEXT: список из одного элемента (или 0).
 * Для MULTI: список option_id.
 * Для RATING: ассоциативный список option_id -> rating.
 * Для IRV: упорядоченный список option_id (ранжирование).
 */
/datum/polls_viewer/proc/get_user_votes(datum/poll_question/poll, ckey)
	if(!ckey || !SSdbcore.Connect())
		return list()

	if(poll.poll_type == POLLTYPE_TEXT)
		var/datum/db_query/query = SSdbcore.NewQuery(
			"SELECT replytext FROM [format_table_name("poll_textreply")] WHERE pollid = :poll_id AND ckey = :ckey AND deleted = 0 LIMIT 1",
			list("poll_id" = poll.poll_id, "ckey" = ckey)
		)
		if(!query.warn_execute())
			qdel(query)
			return list()
		var/text = ""
		if(query.NextRow())
			text = query.item[1]
		qdel(query)
		return list("text" = text)

	var/datum/db_query/query = SSdbcore.NewQuery(
		"SELECT id, optionid, rating FROM [format_table_name("poll_vote")] WHERE pollid = :poll_id AND ckey = :ckey AND deleted = 0 ORDER BY id ASC",
		list("poll_id" = poll.poll_id, "ckey" = ckey)
	)
	if(!query.warn_execute())
		qdel(query)
		return list()

	var/list/result = list()
	switch(poll.poll_type)
		if(POLLTYPE_OPTION)
			if(query.NextRow())
				result["option_id"] = text2num(query.item[2])
		if(POLLTYPE_RATING)
			var/list/ratings = list()
			while(query.NextRow())
				ratings["[query.item[2]]"] = text2num(query.item[3])
			result["ratings"] = ratings
		if(POLLTYPE_MULTI)
			var/list/picked = list()
			while(query.NextRow())
				picked += text2num(query.item[2])
			result["option_ids"] = picked

	qdel(query)
	return result
