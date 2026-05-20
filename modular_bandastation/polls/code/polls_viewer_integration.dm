/datum/polls_viewer/ui_act(action, list/params, datum/tgui/ui, datum/ui_state/state)
	. = ..()
	if(.)
		return

	var/mob/user = ui.user
	var/ckey = user.client?.ckey
	if(!ckey)
		return

	switch(action)
		if("select_poll")
			if(!try_begin_polls_ui_busy(ckey))
				return TRUE
			ui.send_update(force = TRUE)
			var/ref_str = params["ref"]
			var/datum/poll_question/poll
			if(findtext(ref_str, "archived:") == 1)
				if(!user.client.holder)
					end_polls_ui_busy(ckey)
					ui.send_update(force = TRUE)
					return TRUE
				var/poll_id = text2num(copytext(ref_str, length("archived:") + 1))
				poll = ensure_archived_poll_loaded(poll_id)
			else
				poll = locate(ref_str) in GLOB.polls
			if(!poll || ((poll.admin_only || poll.future_poll) && !user.client.holder))
				end_polls_ui_busy(ckey)
				ui.send_update(force = TRUE)
				return TRUE
			selected_poll_by_ckey[ckey] = poll
			end_polls_ui_busy(ckey)
			ui.send_full_update(force = TRUE, always_instant = TRUE)
			return TRUE

		if("back_to_list")
			if(!try_begin_polls_ui_busy(ckey))
				return TRUE
			ui.send_update(force = TRUE)
			selected_poll_by_ckey -= ckey
			end_polls_ui_busy(ckey)
			ui.send_full_update(force = TRUE, always_instant = TRUE)
			return TRUE

		if("vote")
			if(!try_begin_polls_ui_busy(ckey))
				return TRUE
			ui.send_update(force = TRUE)
			var/datum/poll_question/poll = locate(params["poll_ref"]) in GLOB.polls
			if(!poll)
				end_polls_ui_busy(ckey)
				ui.send_update(force = TRUE)
				return TRUE
			if(handle_vote(poll, user, params))
				GLOB.polls_viewer.refresh_title_screen_poll_button(user)
			end_polls_ui_busy(ckey)
			ui.send_full_update(force = TRUE, always_instant = TRUE)
			return TRUE

		if("refresh")
			if(!try_begin_polls_ui_busy(ckey))
				return TRUE
			ui.send_update(force = TRUE)
			end_polls_ui_busy(ckey)
			ui.send_full_update(force = TRUE, always_instant = TRUE)
			return TRUE

		if("reload_polls")
			if(!user.client.holder)
				return TRUE
			if(!try_begin_polls_ui_busy(ckey))
				return TRUE
			ui.send_update(force = TRUE)
			GLOB.polls.Cut()
			GLOB.poll_options.Cut()
			load_poll_data()
			end_polls_ui_busy(ckey)
			ui.send_full_update(force = TRUE, always_instant = TRUE)
			return TRUE

		if("admin_delete_text_reply")
			return handle_polls_admin_delete_text_reply(ui, user, ckey, params)

		if("admin_delete_respondent_votes")
			return handle_polls_admin_delete_respondent(ui, user, ckey, params)

/**
 * Handles vote payload from TGUI.
 * Adapts incoming params to href_list format expected by vote_on_poll_* procs.
 * Returns TRUE if submission reached vote_on_poll_handler (for lobby badge refresh).
 */
/datum/polls_viewer/proc/handle_vote(datum/poll_question/poll, mob/user, list/params)
	if(!isnewplayer(user))
		to_chat(user, span_warning("Голосовать можно только из лобби."))
		return FALSE

	var/mob/dead/new_player/new_player = user
	var/list/href_list = list()

	switch(poll.poll_type)
		if(POLLTYPE_OPTION)
			var/datum/poll_option/option = locate(params["option_ref"]) in poll.options
			if(!option)
				return FALSE
			href_list["voteoptionref"] = params["option_ref"]

		if(POLLTYPE_TEXT)
			var/text = params["replytext"]
			if(!text)
				return FALSE
			href_list["replytext"] = text

		if(POLLTYPE_RATING)
			var/list/ratings = params["ratings"]
			if(!islist(ratings) || !length(ratings))
				return FALSE
			// vote_on_poll_rating() does href_list.Cut(1, 3), so first two keys are service keys
			href_list["src"] = "tgui"
			href_list["votepollref"] = params["poll_ref"]
			for(var/option_ref in ratings)
				var/datum/poll_option/option = locate(option_ref) in poll.options
				if(!option)
					continue
				href_list[option_ref] = ratings[option_ref]

		if(POLLTYPE_MULTI)
			var/list/selected = params["option_refs"]
			if(!islist(selected) || !length(selected))
				return FALSE
			// vote_on_poll_multi() does href_list.Cut(1, 3), first two keys are service keys
			href_list["src"] = "tgui"
			href_list["votepollref"] = params["poll_ref"]
			for(var/option_ref in selected)
				var/datum/poll_option/option = locate(option_ref) in poll.options
				if(!option)
					continue
				href_list[option_ref] = TRUE

	new_player.vote_on_poll_handler(poll, href_list)
	return TRUE

/datum/polls_viewer/proc/handle_polls_admin_delete_text_reply(datum/tgui/ui, mob/user, ckey_actor, list/params)
	if(!try_begin_polls_ui_busy(ckey_actor))
		return TRUE
	ui.send_update(force = TRUE)
	if(!check_rights_for(user.client, R_POLL))
		end_polls_ui_busy(ckey_actor)
		ui.send_full_update(force = TRUE, always_instant = TRUE)
		return TRUE
	var/datum/poll_question/poll = resolve_poll_for_ui(params["poll_ref"], user)
	var/reply_row_id = text2num(params["reply_id"])
	if(!poll?.poll_id || reply_row_id <= 0 || poll.poll_type != POLLTYPE_TEXT || !SSdbcore.Connect())
		end_polls_ui_busy(ckey_actor)
		ui.send_full_update(force = TRUE, always_instant = TRUE)
		return TRUE
	var/datum/db_query/query_verify = SSdbcore.NewQuery(
		"SELECT ckey FROM [format_table_name("poll_textreply")] WHERE id = :reply_id AND pollid = :poll_id AND deleted = 0",
		list("reply_id" = reply_row_id, "poll_id" = poll.poll_id)
	)
	if(!query_verify.warn_execute() || !query_verify.NextRow())
		qdel(query_verify)
		end_polls_ui_busy(ckey_actor)
		to_chat(user, span_warning("Ответ не найден или уже удалён."), confidential = TRUE)
		ui.send_full_update(force = TRUE, always_instant = TRUE)
		return TRUE
	var/reply_author = "[query_verify.item[1]]"
	qdel(query_verify)
	var/datum/db_query/query_delete = SSdbcore.NewQuery(
		"UPDATE [format_table_name("poll_textreply")] SET deleted = 1 WHERE id = :reply_id AND pollid = :poll_id AND deleted = 0",
		list("reply_id" = reply_row_id, "poll_id" = poll.poll_id)
	)
	query_delete.warn_execute()
	qdel(query_delete)
	refresh_poll_datum_vote_count(poll)
	var/kna = key_name_admin(user)
	message_admins("[kna] removed text reply #[reply_row_id] from poll #[poll.poll_id].")
	log_admin("[key_name(user)] deleted text reply id=[reply_row_id] for poll_id=[poll.poll_id]")
	to_chat(user, span_notice("Текстовый ответ удалён."), confidential = TRUE)
	if(length(reply_author))
		for(var/mob/dead/new_player/np as anything in GLOB.new_player_list)
			if(np.ckey != reply_author)
				continue
			refresh_title_screen_poll_button(np)
	end_polls_ui_busy(ckey_actor)
	ui.send_full_update(force = TRUE, always_instant = TRUE)
	return TRUE

/datum/polls_viewer/proc/handle_polls_admin_delete_respondent(datum/tgui/ui, mob/user, ckey_actor, list/params)
	if(!try_begin_polls_ui_busy(ckey_actor))
		return TRUE
	ui.send_update(force = TRUE)
	if(!check_rights_for(user.client, R_POLL))
		end_polls_ui_busy(ckey_actor)
		ui.send_full_update(force = TRUE, always_instant = TRUE)
		return TRUE
	var/datum/poll_question/poll = resolve_poll_for_ui(params["poll_ref"], user)
	var/target_ckey = params["target_ckey"]
	if(!poll?.poll_id || !length(target_ckey) || !(poll.poll_type == POLLTYPE_OPTION || poll.poll_type == POLLTYPE_MULTI || poll.poll_type == POLLTYPE_RATING) || !SSdbcore.Connect())
		end_polls_ui_busy(ckey_actor)
		ui.send_full_update(force = TRUE, always_instant = TRUE)
		return TRUE
	var/datum/db_query/query_verify = SSdbcore.NewQuery(
		"SELECT COUNT(*) FROM [format_table_name("poll_vote")] WHERE pollid = :poll_id AND ckey = :target_ckey AND deleted = 0",
		list("poll_id" = poll.poll_id, "target_ckey" = target_ckey)
	)
	if(!query_verify.warn_execute() || !query_verify.NextRow() || text2num(query_verify.item[1]) <= 0)
		qdel(query_verify)
		end_polls_ui_busy(ckey_actor)
		to_chat(user, span_warning("У этого игрока нет активных голосов в этом опросе."), confidential = TRUE)
		ui.send_full_update(force = TRUE, always_instant = TRUE)
		return TRUE
	qdel(query_verify)
	var/datum/db_query/query_delete = SSdbcore.NewQuery(
		"UPDATE [format_table_name("poll_vote")] SET deleted = 1 WHERE pollid = :poll_id AND ckey = :target_ckey AND deleted = 0",
		list("poll_id" = poll.poll_id, "target_ckey" = target_ckey)
	)
	query_delete.warn_execute()
	qdel(query_delete)
	refresh_poll_datum_vote_count(poll)
	var/kna = key_name_admin(user)
	message_admins("[kna] removed all votes from ckey '[target_ckey]' on poll #[poll.poll_id].")
	log_admin("[key_name(user)] deleted poll votes by ckey=[target_ckey] for poll_id=[poll.poll_id]")
	to_chat(user, span_notice("Голос игрока снят с опроса."), confidential = TRUE)
	for(var/mob/dead/new_player/np as anything in GLOB.new_player_list)
		if(np.ckey != target_ckey)
			continue
		refresh_title_screen_poll_button(np)
	end_polls_ui_busy(ckey_actor)
	ui.send_full_update(force = TRUE, always_instant = TRUE)
	return TRUE
