GLOBAL_DATUM_INIT(polls_viewer, /datum/polls_viewer, new)

/datum/polls_viewer
	/// Currently selected poll per user
	var/list/selected_poll_by_ckey = list()
	/// Finished polls loaded from DB for admin requests
	var/list/archived_polls_cache = list()
	/// Prevents stacked TGUI actions per ckey while a DB update runs
	var/list/polls_ui_busy = list()

/datum/polls_viewer/ui_state(mob/user)
	if(check_rights_for(user.client, R_POLL))
		return ADMIN_STATE(R_POLL)
	return GLOB.new_player_state

/datum/polls_viewer/ui_close(mob/user)
	. = ..()
	if(user.client?.ckey)
		selected_poll_by_ckey -= user.client.ckey
		polls_ui_busy -= user.client.ckey

/datum/polls_viewer/ui_interact(mob/user, datum/tgui/ui)
	ui = SStgui.try_update_ui(user, src, ui)
	if(!ui)
		ui = new(user, src, "PollsViewer")
		ui.open()

/datum/polls_viewer/ui_data(mob/user)
	var/list/data = list()
	var/ckey = user.client?.ckey
	if(ckey)
		data["ui_busy"] = !!polls_ui_busy[ckey]
	return data

/// Returns FALSE if already busy — caller should noop and optionally return blocked.
/datum/polls_viewer/proc/try_begin_polls_ui_busy(ckey)
	if(!ckey)
		return FALSE
	if(polls_ui_busy[ckey])
		return FALSE
	polls_ui_busy[ckey] = TRUE
	return TRUE

/datum/polls_viewer/proc/end_polls_ui_busy(ckey)
	polls_ui_busy -= ckey

/datum/polls_viewer/ui_static_data(mob/user)
	var/list/data = list()
	var/ckey = user.client?.ckey
	var/is_pollster = check_rights_for(user.client, R_POLL)

	// Load poll participation once for this static payload build
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

	// Admins get brief cards for archived polls
	if(is_pollster)
		for(var/list/archived in load_archived_polls_brief())
			polls_data += list(archived)

	data["polls"] = polls_data
	data["is_pollster"] = is_pollster
	data["ckey"] = ckey

	var/datum/poll_question/selected = selected_poll_by_ckey[ckey]
	data["selected_poll"] = selected ? build_selected_poll_data(selected, user) : null

	return data

/**
 * Loads brief cards for finished polls for admin archive view.
 * Full data is loaded only for selected poll.
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
 * Ensures archived poll is loaded into cache.
 * Returns datum/poll_question or null.
 */
/datum/polls_viewer/proc/ensure_archived_poll_loaded(poll_id)
	var/cache_key = "[poll_id]"
	if(archived_polls_cache[cache_key])
		return archived_polls_cache[cache_key]
	if(!SSdbcore.Connect())
		return null
	var/datum/db_query/query = SSdbcore.NewQuery(
		{"SELECT q.id, q.polltype, q.starttime, q.endtime, q.question, q.subtitle, q.adminonly,
			q.multiplechoiceoptions, q.dontshow, q.allow_revoting,
			IF(q.polltype='TEXT',
				(SELECT COUNT(ckey) FROM [format_table_name("poll_textreply")] AS t WHERE t.pollid = q.id AND t.deleted = 0),
				(SELECT COUNT(DISTINCT ckey) FROM [format_table_name("poll_vote")] AS v WHERE v.pollid = q.id AND v.deleted = 0)),
			IFNULL((SELECT byond_key FROM [format_table_name("player")] AS p WHERE p.ckey = q.createdby_ckey), q.createdby_ckey),
			IF(q.starttime > NOW(), 1, 0)
			FROM [format_table_name("poll_question")] AS q WHERE q.id = :poll_id AND q.deleted = 0"},
		list("poll_id" = poll_id)
	)
	if(!query.warn_execute() || !query.NextRow())
		qdel(query)
		return null
	var/datum/poll_question/poll = new(
		query.item[1], query.item[2], query.item[3], query.item[4], query.item[5], query.item[6],
		query.item[7], query.item[8], query.item[9], query.item[10], query.item[11], query.item[12],
		query.item[13], TRUE
	)
	qdel(query)
	// Remove from GLOB.polls, as it registers itself automatically
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

	archived_polls_cache[cache_key] = poll
	return poll

/datum/polls_viewer/proc/get_voted_poll_ids(ckey)
	var/list/result = list()
	if(!ckey || !SSdbcore.Connect())
		return result

	var/datum/db_query/query = SSdbcore.NewQuery({"
		SELECT pollid FROM (
			SELECT pollid FROM [format_table_name("poll_vote")] WHERE ckey = :ckey AND deleted = 0
			UNION
			SELECT pollid FROM [format_table_name("poll_textreply")] WHERE ckey = :ckey AND deleted = 0
		) AS participated
	"}, list("ckey" = ckey))
	if(query.warn_execute())
		while(query.NextRow())
			result["[query.item[1]]"] = TRUE
	qdel(query)

	return result

/**
 * Can this user see poll results?
 * Admins always can; everyone else only when poll is finished or dont_show is not set.
 */
/datum/polls_viewer/proc/can_view_results(datum/poll_question/poll, mob/user)
	if(user.client?.holder)
		return TRUE
	if(poll.dont_show && !is_poll_finished(poll))
		return FALSE
	return TRUE

/**
 * Checks whether poll is finished based on end_datetime.
 */
/datum/polls_viewer/proc/is_poll_finished(datum/poll_question/poll)
	if(!poll.end_datetime)
		return FALSE
	// Archived polls were ended in DB before they were listed
	if(is_archived_cached_poll(poll))
		return TRUE
	var/current_stamp = ISOtime(world.timeofday)
	if(length(poll.end_datetime) == 19 && length(current_stamp) == 19)
		return current_stamp > poll.end_datetime
	if(!SSdbcore.Connect())
		return FALSE
	var/datum/db_query/query = SSdbcore.NewQuery(
		"SELECT NOW() > :end_dt",
		list("end_dt" = poll.end_datetime)
	)
	if(!query.warn_execute())
		qdel(query)
		return FALSE
	var/finished = query.NextRow() ? text2num(query.item[1]) : FALSE
	qdel(query)
	return finished

/datum/polls_viewer/proc/is_archived_cached_poll(datum/poll_question/poll)
	for(var/key in archived_polls_cache)
		if(archived_polls_cache[key] == poll)
			return TRUE
	return FALSE

/**
 * Builds full data for selected poll:
 * options, user votes, and results
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
		"future_poll" = !!poll.future_poll,
		"allow_revoting" = !!poll.allow_revoting,
		"dont_show" = !!poll.dont_show,
		"options_allowed" = poll.options_allowed,
		"total_votes" = poll.poll_votes,
		"created_by" = poll.created_by ? "[poll.created_by]" : null,
	)
	if(is_archived_cached_poll(poll))
		data["ref"] = "archived:[poll.poll_id]"

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
	var/admin_vote_tools = check_rights_for(user.client, R_POLL)
	data["results"] = data["can_view_results"] ? calculate_poll_results(poll, admin_vote_tools) : null

	return data

/// Syncs datum vote counter with DB.
/datum/polls_viewer/proc/refresh_poll_datum_vote_count(datum/poll_question/poll)
	if(!poll?.poll_id || !SSdbcore.Connect())
		return
	var/count_sql = poll.poll_type == POLLTYPE_TEXT ? {"
			SELECT COUNT(ckey) FROM [format_table_name("poll_textreply")] WHERE pollid = :poll_id AND deleted = 0
			"} : {"
			SELECT COUNT(DISTINCT ckey) FROM [format_table_name("poll_vote")] WHERE pollid = :poll_id AND deleted = 0
			"}
	var/datum/db_query/query_count = SSdbcore.NewQuery(count_sql, list("poll_id" = poll.poll_id))
	if(!query_count.warn_execute())
		qdel(query_count)
		return
	if(query_count.NextRow())
		poll.poll_votes = text2num(query_count.item[1]) || 0
	qdel(query_count)

/// Resolves a poll from lobby UI ref live datum ref or archived id for pollsters viewing DB cache.
/datum/polls_viewer/proc/resolve_poll_for_ui(ref_str, mob/user)
	if(!ref_str || !user?.client)
		return null
	if(findtext(ref_str, "archived:") == 1)
		if(!check_rights_for(user.client, R_POLL))
			return null
		var/poll_id = text2num(copytext(ref_str, length("archived:") + 1))
		return poll_id ? ensure_archived_poll_loaded(poll_id) : null
	return locate(ref_str) in GLOB.polls


/// Rebuilds lobby title so the polls button badge matches DB vote state.
/datum/polls_viewer/proc/refresh_title_screen_poll_button(mob/user)
	if(!user?.client || !isnewplayer(user))
		return
	if(!SStitle?.current_title_screen)
		return
	SStitle.show_title_screen_to(user.client)

/**
 * Returns current user votes for this poll
 * OPTION/TEXT: single value payload (or empty)
 * MULTI: list of option_id values
 * RATING: associative list option_id -> rating
 * IRV: deprecated
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
