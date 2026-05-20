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
