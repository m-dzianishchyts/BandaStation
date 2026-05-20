/**
 * Обработка действий пользователя из TGUI.
 */
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
			var/ref_str = params["ref"]
			var/datum/poll_question/poll
			if(findtext(ref_str, "archived:") == 1)
				if(!user.client.holder)
					return TRUE
				var/poll_id = text2num(copytext(ref_str, length("archived:") + 1))
				poll = ensure_archived_poll_loaded(poll_id)
			else
				poll = locate(ref_str) in GLOB.polls
			if(!poll)
				return TRUE
			if(poll.admin_only && !user.client.holder)
				return TRUE
			if(poll.future_poll && !user.client.holder)
				return TRUE
			selected_poll_by_ckey[ckey] = poll
			ui.send_full_update()
			return TRUE

		if("back_to_list")
			selected_poll_by_ckey -= ckey
			ui.send_full_update()
			return TRUE

		if("vote")
			var/datum/poll_question/poll = locate(params["poll_ref"]) in GLOB.polls
			if(!poll)
				return TRUE
			handle_vote(poll, user, params)
			ui.send_full_update() // обновить результаты и voted-флаги
			return TRUE

		if("refresh")
			ui.send_full_update()
			return TRUE

		if("reload_polls")
			if(!user.client.holder)
				return TRUE
			GLOB.polls.Cut()
			GLOB.poll_options.Cut()
			load_poll_data()
			ui.send_full_update()
			return TRUE

/**
 * Обработка голоса с TGUI. Адаптер над существующими процедурами голосования.
 * Собирает href_list в формате, который ждут vote_on_poll_* процедуры, и передаёт им.
 */
/datum/polls_viewer/proc/handle_vote(datum/poll_question/poll, mob/user, list/params)
	if(!isnewplayer(user))
		to_chat(user, span_warning("Голосовать можно только из лобби."))
		return

	var/mob/dead/new_player/new_player = user
	var/list/href_list = list()

	switch(poll.poll_type)
		if(POLLTYPE_OPTION)
			var/datum/poll_option/option = locate(params["option_ref"]) in poll.options
			if(!option)
				return
			href_list["voteoptionref"] = params["option_ref"]

		if(POLLTYPE_TEXT)
			var/text = params["replytext"]
			if(!text)
				return
			href_list["replytext"] = text

		if(POLLTYPE_RATING)
			var/list/ratings = params["ratings"]
			if(!islist(ratings) || !length(ratings))
				return
			// vote_on_poll_rating() делает href_list.Cut(1, 3), так что первые 2 элемента -- служебные.
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
				return
			// vote_on_poll_multi() делает href_list.Cut(1, 3), первые 2 элемента -- служебные.
			href_list["src"] = "tgui"
			href_list["votepollref"] = params["poll_ref"]
			for(var/option_ref in selected)
				var/datum/poll_option/option = locate(option_ref) in poll.options
				if(!option)
					continue
				href_list[option_ref] = TRUE

	new_player.vote_on_poll_handler(poll, href_list)
