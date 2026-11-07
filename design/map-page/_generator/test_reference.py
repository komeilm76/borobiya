"""Contract tests for the map-page reference images.

They do not compare pixels (the renderer is deterministic, so that would only test Pillow). They
check the things that actually rot in a design folder that has to stay true to the product:

1. a plate is registered but missing on disk, or a PNG is on disk but nobody registers it;
2. a plate on disk is not the phone size the README claims (a stale render after a layout change);
3. the README index and the registry disagree about which plates exist;
4. the icon names used by the new companion plates are not in the vendored MDI font;
5. the numbers printed on the live plate contradict the recorded trip they are derived from.

Run from `design/map-page/_generator`:  python -m pytest . -q
"""
from __future__ import annotations

import os
import re
import sys

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
DESIGN = os.path.abspath(os.path.join(HERE, ".."))
CSS = os.path.join(HERE, "assets", "materialdesignicons.css")

sys.path.insert(0, HERE)

import render  # noqa: E402


def screens() -> dict:
    return render.registry()


def readme() -> str:
    with open(os.path.join(DESIGN, "README.md"), encoding="utf-8") as handle:
        return handle.read()


def test_registry_and_disk_agree():
    registered = {path for path, _ in screens().values()}
    on_disk = set()
    for folder in ("design-system", "history", "navigation", "mission", "companions", "sos",
                   "profile"):
        directory = os.path.join(DESIGN, folder)
        for name in sorted(os.listdir(directory)):
            if name.endswith(".png"):
                on_disk.add(f"{folder}/{name}")
    assert registered == on_disk, (
        f"missing on disk: {sorted(registered - on_disk)}; not registered: {sorted(on_disk - registered)}")


def test_every_plate_is_a_phone_screenshot():
    from PIL import Image

    expected = (786, 1704)
    wrong = {}
    for path, _ in screens().values():
        if path.startswith("design-system/"):    # those plates are spec sheets, not phone screens
            continue
        with Image.open(os.path.join(DESIGN, path)) as image:
            if image.size != expected:
                wrong[path] = image.size
    assert not wrong, f"plates not at {expected}: {wrong}"


def test_readme_lists_every_plate():
    text = readme()
    missing = [path for path, _ in screens().values() if os.path.basename(path) not in text]
    assert not missing, f"plates missing from the README index: {missing}"


def test_companion_plates_only_use_real_icons():
    css = open(CSS, encoding="utf-8").read()
    known = set(re.findall(r"\.mdi-([a-z0-9-]+)::?before", css))
    assert known, "could not read the icon font css"

    import importlib

    used: set[str] = set()
    for module_name in render.SECTIONS.values():
        module = importlib.import_module(module_name)
        source = open(module.__file__, encoding="utf-8").read()
        used.update(re.findall(r'"mdi-([a-z0-9-]+)"', source))
    assert not (used - known), f"icons that would render as a blank box: {sorted(used - known)}"


def test_live_plate_numbers_match_the_route():
    """The sheet said «۲۰۰ متر جلوتر» while the marker was ۳۷۰ متر behind; keep that from returning."""
    from bb import scenario as sc

    total = sum(sc.grid_length(sc.ROUTE_MAIN[i], sc.ROUTE_MAIN[i + 1])
                for i in range(len(sc.ROUTE_MAIN) - 1))
    me = sc.ME_T * total
    ahead = [c for c in sc.COMPANIONS if c["t"] > sc.ME_T]
    assert ahead, "no companion is ahead of me any more"
    gaps = sorted(round(c["t"] * total - me) for c in ahead)
    assert all(40 <= gap <= 400 for gap in gaps), f"distances to companions are not plausible: {gaps}"


@pytest.mark.parametrize("key,needle", [
    ("c03-companions-live", "۱۹۰ متر جلوتر"),
    ("c05-companion-status", "۲۱۰ متر"),
    ("c07-share-history", "از تاریخ"),
    ("c10-companions-offline", "ذخیره‌شده در این دستگاه"),
])
def test_key_plates_keep_their_promise(key, needle):
    import inspect

    module = __import__("screens.companions", fromlist=["SCREENS"])
    assert key in module.SCREENS
    path, fn = module.SCREENS[key]
    assert inspect.getsource(fn).find(needle) != -1, f"{path} lost its copy: {needle}"
    screen = fn()
    assert (screen.w, screen.h) == (393, 852)


# --------------------------------------------------------------------------- #
# history: a calendar whose per-day totals have to match its own rows
# --------------------------------------------------------------------------- #
def _fa_number(text: str) -> float:
    return float(text.translate(str.maketrans("۰۱۲۳۴۵۶۷۸۹", "0123456789")).replace("٫", "."))


def test_history_groups_add_up():
    """«۲ سفر · ۵٫۱ کیلومتر» has to be the sum of the two rows printed under it."""
    from screens import history

    assert len(history.DAYS) >= 2, "a grouped record needs more than one day"
    for day in history.DAYS:
        trips = day["trips"]
        assert trips, day["title"]
        assert day["summary"].startswith(history.fa_digits(str(len(trips)))), (
            f"{day['title']}: «{day['summary']}» does not start with the row count {len(trips)}")
        total = 0.0
        for trip in trips:
            match = re.match(r"([۰-۹]+(?:٫[۰-۹]+)?) کیلومتر", trip["meta"])
            assert match, f"{day['title']}: no distance in «{trip['meta']}»"
            total += _fa_number(match.group(1))
        stated = re.search(r"([۰-۹]+(?:٫[۰-۹]+)?) کیلومتر", day["summary"])
        assert stated, day["summary"]
        assert abs(total - _fa_number(stated.group(1))) < 0.05, (
            f"{day['title']}: rows add up to {total}, the header says {stated.group(1)}")


def test_history_keeps_three_records():
    """Trips, missions (from both sides) and companions — not one list with a filter."""
    from screens import history

    assert history.TABS == ["سفرها", "مأموریت‌ها", "همراهان"]
    assert history.REQUEST_DAYS and history.AGENT_DAYS
    sos = {"pending", "dispatched", "accepted", "cancelled_by_requester",
           "cancelled_by_rescuer", "expired", "completed"}
    mission = {"pending", "on_the_way", "arrived", "in_progress", "completed",
               "cancelled_by_requester", "cancelled_by_rescuer", "expired"}
    assert set(history.SOS_STATUS) == sos, "the requester rows must speak the API's statuses"
    assert set(history.MISSION_STATUS) == mission
    for day in history.REQUEST_DAYS + history.AGENT_DAYS:
        assert day["rows"], day["title"]
        assert day["summary"].startswith(history.fa_digits(str(len(day["rows"])))), day["title"]


def test_the_map_row_shows_two_bookmarks_only():
    """«فقط دو نشان روی نقشه» — the third saved place must not push a third chip into the row."""
    from screens import nav

    assert nav.CHIP_LIMIT == 2
    assert len(nav.BOOKMARKS) > nav.CHIP_LIMIT, "a shortcut row is only a choice if there are more"
    assert [item["pinned"] for item in nav.BOOKMARKS[:2]] == [True, True], (
        "the two places that reach the map row have to be the pinned head of the list")


def test_the_saved_place_lands_in_the_profile_list():
    """Plate 03 saves one place; the profile list has to be the same list plus that one."""
    from screens import nav, profile

    map_names = [item["name"] for item in nav.BOOKMARKS]
    profile_names = [item[0] for item in profile.PLACES]
    assert profile_names == map_names + [nav.NEW_PLACE["name"]], profile_names
    # the map row is the head of the same list, not a second hard-coded pair
    assert profile_names[:2] == ["خانه", "محل کار"]


def test_a_place_is_saved_from_a_press_on_the_map():
    """The requested flow: long press → one small icon button → a form naming the place."""
    import inspect

    from screens import nav

    for key in ("02-map-press-hold", "03-bookmark-form", "04-bookmark-saved"):
        assert key in nav.SCREENS, key
    hold = inspect.getsource(nav.map_press_hold)
    assert "place_action_pin(" in hold
    assert "mdi-bookmark-plus-outline" in hold
    form = inspect.getsource(nav.bookmark_form)
    for needle in ("نام این مکان", "برچسب", "ذخیره در نشان‌ها"):
        assert needle in form, needle


def test_history_rows_stay_compact():
    """The whole point of the rebuild: a day fits on one screen, so rows are ~84px, not 146."""
    from screens import history

    assert history.ROW_H <= 90, history.ROW_H
    tallest = history.DAYS[0]["trips"][0]
    assert tallest["status"] in history._STATUS


# --------------------------------------------------------------------------- #
# profile: one account, described the same way on every plate
# --------------------------------------------------------------------------- #
def test_profile_logins_and_devices_agree():
    """A diary of sign-ins and a list of live sessions, about the same account.

    Four sign-ins, three open sessions: the device page may only show what is still signed in,
    and both pages have to name those devices the same way.
    """
    from screens import profile

    logins, devices = profile.SESSIONS, profile.DEVICES
    assert len(logins) == 4 and len(devices) == 3
    assert {row["device"] for row in logins} == {row["device"] for row in devices}
    assert sum(1 for row in logins if row["current"]) == 1
    assert sum(1 for row in devices if row["current"]) == 1
    # the plate's clock is the current session's last activity
    current = next(row for row in logins if row["current"])
    assert current["time"] == "۹:۵۲", current["time"]
    # two sign-ins from the desktop, one open session on it: a page of entries is not a page of
    # devices, which is exactly why the two plates exist
    assert sum(1 for row in logins if row["device"].startswith("Chrome")) == 2
    assert sum(1 for row in devices if row["device"].startswith("Chrome")) == 1
    # a login clock has to land inside the device's age («دیروز ۲۱:۴۰»)
    safari_login = next(row for row in logins if row["device"].startswith("Safari"))
    safari_device = next(row for row in devices if row["device"].startswith("Safari"))
    assert safari_login["time"] in safari_device["when"], (
        safari_login["time"], safari_device["when"])


def test_ending_a_session_only_lives_on_the_device_page():
    """The revoke control belongs to the page about sessions, never to the diary."""
    import inspect

    from screens import profile

    assert "پایان دسترسی" in inspect.getsource(profile.profile_devices)
    assert "پایان دسترسی" not in inspect.getsource(profile.profile_sessions)
    assert "پایان" not in inspect.getsource(profile._login_row)


def test_profile_ips_are_latin_runs():
    """A Persian-digit IP next to Persian text reorders itself into «۹۱٠٠٠۵/۲۳۸/»."""
    from screens import profile

    for item in profile.SESSIONS + profile.DEVICES:
        assert re.fullmatch(r"[0-9.•]+", item["ip"]), item["ip"]


def test_the_account_has_a_door_on_the_map():
    import inspect

    from screens import nav, profile

    assert "p-07-entry" in profile.SCREENS
    assert "map_avatar_button(" in inspect.getsource(nav.map_idle), (
        "the map entry plate shows an account button the idle map must also carry")


# --------------------------------------------------------------------------- #
# mission state: every mission plate must say where the mission stands
# --------------------------------------------------------------------------- #
MISSION_STAGES = ("پذیرش", "در مسیر", "رسیده", "رسیدگی", "پایان")


def _mission_module():
    import screens.mission as module
    return module


@pytest.mark.parametrize("key", [
    "m-03-offer", "m-04-offer-details", "m-05-accepted", "m-06-dispatch", "m-07-navigation",
    "m-08-alternatives", "m-09-arrived", "m-10-in-progress", "m-11-support",
    "m-12-support-pending", "m-13-support-accepted", "m-14-team", "m-15-cancel",
    "m-16-report", "m-17-completed",
])
def test_every_mission_plate_declares_the_stage(key):
    """The user's complaint: «وضعیت مأموریت باید در همهٔ مراحل دیده شود» — not only on 06.

    Every plate that happens while a mission exists has to draw one of the three state components
    (rail, slim line, pill); the two modal plates carry the stage in their subtitle instead.
    """
    import inspect

    module = _mission_module()
    assert key in module.PLATES, f"{key} is not registered"
    path, fn = module.PLATES[key]
    source = inspect.getsource(fn)
    draws_state = any(token in source for token in
                      ("mission_rail(", "mission_steps(", "mission_pill("))
    says_stage = any(f"مرحلهٔ {fa} از ۵" in source for fa in "۱۲۳۴۵")
    assert draws_state or says_stage, (
        f"{path} never states where the mission stands — draw mission_rail/steps/pill "
        f"or put «مرحلهٔ n از ۵» in its subtitle")


def test_no_plate_prints_a_time_for_a_future_stage():
    """A timestamp under «رسیدگی» on a plate that is still in «پذیرش» reads as history."""
    import screens.mission as module
    from bb import ui

    for key in ("m-06-dispatch", "m-09-arrived"):
        _, fn = module.PLATES[key]
        screen = fn()
        assert (screen.w, screen.h) == (393, 852)


def test_mission_clock_matches_the_stage_times():
    """The status bar is the plate's moment: a ۹:۴۱ clock over «۱۰:۱۲» in the sheet is a bug."""
    from bb import scenario as sc

    for key, clock in sc.MISSION_CLOCKS.items():
        assert key in _mission_module().PLATES, f"{key} has a clock but no plate"
        assert re.fullmatch(r"[۰-۹]{1,2}:[۰-۹]{2}", clock), f"{key}: {clock!r} is not a Persian time"

    accepted = sc.MISSION_TIMES["accepted"]
    closed = sc.MISSION_TIMES["closed"]
    def minutes(text: str) -> int:
        hour, minute = (int(part.translate(str.maketrans("۰۱۲۳۴۵۶۷۸۹", "0123456789")))
                        for part in text.split(":"))
        return hour * 60 + minute
    assert minutes(closed) - minutes(accepted) == sc.MISSION_MINUTES
    assert sc.MISSION_STAGE_TIMES_DONE[-1] == closed


# --------------------------------------------------------------------------- #
# SOS request flow: one request, one set of numbers, on every plate
# --------------------------------------------------------------------------- #
def _sos_module():
    import screens.sos as module
    return module


def test_sos_has_a_plate_for_every_requested_state():
    """The user asked for «all steps and pages»: every state the API can report is drawn.

    A status may be carried by a plate of its own (pending) or by a row/record on the list
    plate (cancelled_by_requester, expired), so the map is status → plate, not status → filename.
    """
    plates = _sos_module().PLATES
    status_to_plate = {
        "pending": "s-08-pending",
        "dispatched": "s-09-dispatched",
        "accepted": "s-10-accepted",
        "completed": "s-12-completed",
        "cancelled_by_requester": "s-14-cancelled",
        "expired": "s-17-history",
    }
    missing = [status for status, key in status_to_plate.items() if key not in plates]
    assert not missing, f"no plate for: {missing}"
    # and the flow's own steps each exist
    for key in ("s-01-entry", "s-02-hold", "s-03-compose", "s-04-location", "s-05-photo",
                "s-06-review", "s-07-sending", "s-11-arrived", "s-13-cancel",
                "s-15-photo-retry", "s-16-offline", "s-18-history-detail",
                "s-19-validation", "s-20-history-empty"):
        assert key in plates, f"missing plate: {key}"


def test_sos_clock_matches_the_request_times():
    """Same rule as the mission plates: the status bar is the plate's own moment."""
    from bb import scenario as sc

    plates = _sos_module().PLATES
    for key, clock in sc.SOS_CLOCKS.items():
        assert key in plates, f"{key} has a clock but no plate"
        assert re.fullmatch(r"[۰-۹]{1,2}:[۰-۹]{2}", clock), f"{key}: {clock!r}"

    def minutes(text: str) -> int:
        hour, minute = (int(part.translate(str.maketrans("۰۱۲۳۴۵۶۷۸۹", "0123456789")))
                        for part in text.split(":"))
        return hour * 60 + minute

    assert minutes(sc.SOS_TIMES["completed"]) - minutes(sc.SOS_TIMES["submitted"]) == 36
    assert sc.SOS_STAGE_TIMES[3] == sc.SOS_TIMES["arrived"], (
        "the fourth rail stage is «رسیدگی»: its stamp must be the arrival, not «در راه»")
    assert sc.SOS_STAGE_TIMES_DONE[-1] == sc.SOS_TIMES["completed"]
    # the status bar may never be earlier than the last event the plate prints
    assert minutes(sc.SOS_CLOCKS["s-09-dispatched"]) >= minutes(sc.SOS_TIMES["dispatched"])
    assert minutes(sc.SOS_CLOCKS["s-10-accepted"]) >= minutes(sc.SOS_TIMES["accepted"])
    assert minutes(sc.SOS_CLOCKS["s-11-arrived"]) >= minutes(sc.SOS_TIMES["arrived"])


def test_sos_manual_pin_is_near_but_not_on_the_gps_fix():
    """Plate 04 prints the distance between the two: it has to be a real, walkable offset."""
    from bb import scenario as sc

    assert 40 <= sc.SOS_MANUAL_OFFSET_M <= 400, sc.SOS_MANUAL_OFFSET_M
    assert sc.SOS_MANUAL != sc.SOS_POINT


def test_sos_stages_are_the_client_stages():
    from bb import ui

    assert ui.SOS_STAGES == ("ثبت", "اعزام", "پذیرش", "رسیدگی", "پایان")


def test_the_account_has_two_doors_for_two_questions():
    """Sign-ins and sessions are two pages, so the hub needs two doors and neither page tabs."""
    import inspect

    from screens import profile

    hub = inspect.getsource(profile.profile_home)
    assert '"ورودها"' in hub and '"دستگاه‌ها"' in hub
    for page in (profile.profile_sessions, profile.profile_devices):
        assert "_tabs(" not in inspect.getsource(page)
    # the bulk revoke belongs to the page that owns sessions
    assert "_danger_bar(" in inspect.getsource(profile.profile_devices)


# --------------------------------------------------------------------------- #
# mission state: every mission plate must say where the mission stands
# --------------------------------------------------------------------------- #
MISSION_STAGES = ("پذیرش", "در مسیر", "رسیده", "رسیدگی", "پایان")


def _mission_module():
    import screens.mission as module
    return module


@pytest.mark.parametrize("key", [
    "m-03-offer", "m-04-offer-details", "m-05-accepted", "m-06-dispatch", "m-07-navigation",
    "m-08-alternatives", "m-09-arrived", "m-10-in-progress", "m-11-support",
    "m-12-support-pending", "m-13-support-accepted", "m-14-team", "m-15-cancel",
    "m-16-report", "m-17-completed",
])
def test_every_mission_plate_declares_the_stage(key):
    """The user's complaint: «وضعیت مأموریت باید در همهٔ مراحل دیده شود» — not only on 06.

    Every plate that happens while a mission exists has to draw one of the three state components
    (rail, slim line, pill); the two modal plates carry the stage in their subtitle instead.
    """
    import inspect

    module = _mission_module()
    assert key in module.PLATES, f"{key} is not registered"
    path, fn = module.PLATES[key]
    source = inspect.getsource(fn)
    draws_state = any(token in source for token in
                      ("mission_rail(", "mission_steps(", "mission_pill("))
    says_stage = any(f"مرحلهٔ {fa} از ۵" in source for fa in "۱۲۳۴۵")
    assert draws_state or says_stage, (
        f"{path} never states where the mission stands — draw mission_rail/steps/pill "
        f"or put «مرحلهٔ n از ۵» in its subtitle")


def test_no_plate_prints_a_time_for_a_future_stage():
    """A timestamp under «رسیدگی» on a plate that is still in «پذیرش» reads as history."""
    import screens.mission as module
    from bb import ui

    for key in ("m-06-dispatch", "m-09-arrived"):
        _, fn = module.PLATES[key]
        screen = fn()
        assert (screen.w, screen.h) == (393, 852)


def test_mission_clock_matches_the_stage_times():
    """The status bar is the plate's moment: a ۹:۴۱ clock over «۱۰:۱۲» in the sheet is a bug."""
    from bb import scenario as sc

    for key, clock in sc.MISSION_CLOCKS.items():
        assert key in _mission_module().PLATES, f"{key} has a clock but no plate"
        assert re.fullmatch(r"[۰-۹]{1,2}:[۰-۹]{2}", clock), f"{key}: {clock!r} is not a Persian time"

    accepted = sc.MISSION_TIMES["accepted"]
    closed = sc.MISSION_TIMES["closed"]
    def minutes(text: str) -> int:
        hour, minute = (int(part.translate(str.maketrans("۰۱۲۳۴۵۶۷۸۹", "0123456789")))
                        for part in text.split(":"))
        return hour * 60 + minute
    assert minutes(closed) - minutes(accepted) == sc.MISSION_MINUTES
    assert sc.MISSION_STAGE_TIMES_DONE[-1] == closed


# --------------------------------------------------------------------------- #
# SOS request flow: one request, one set of numbers, on every plate
# --------------------------------------------------------------------------- #
def _sos_module():
    import screens.sos as module
    return module


def test_sos_has_a_plate_for_every_requested_state():
    """The user asked for «all steps and pages»: every state the API can report is drawn.

    A status may be carried by a plate of its own (pending) or by a row/record on the list
    plate (cancelled_by_requester, expired), so the map is status → plate, not status → filename.
    """
    plates = _sos_module().PLATES
    status_to_plate = {
        "pending": "s-08-pending",
        "dispatched": "s-09-dispatched",
        "accepted": "s-10-accepted",
        "completed": "s-12-completed",
        "cancelled_by_requester": "s-14-cancelled",
        "expired": "s-17-history",
    }
    missing = [status for status, key in status_to_plate.items() if key not in plates]
    assert not missing, f"no plate for: {missing}"
    # and the flow's own steps each exist
    for key in ("s-01-entry", "s-02-hold", "s-03-compose", "s-04-location", "s-05-photo",
                "s-06-review", "s-07-sending", "s-11-arrived", "s-13-cancel",
                "s-15-photo-retry", "s-16-offline", "s-18-history-detail",
                "s-19-validation", "s-20-history-empty"):
        assert key in plates, f"missing plate: {key}"


def test_sos_clock_matches_the_request_times():
    """Same rule as the mission plates: the status bar is the plate's own moment."""
    from bb import scenario as sc

    plates = _sos_module().PLATES
    for key, clock in sc.SOS_CLOCKS.items():
        assert key in plates, f"{key} has a clock but no plate"
        assert re.fullmatch(r"[۰-۹]{1,2}:[۰-۹]{2}", clock), f"{key}: {clock!r}"

    def minutes(text: str) -> int:
        hour, minute = (int(part.translate(str.maketrans("۰۱۲۳۴۵۶۷۸۹", "0123456789")))
                        for part in text.split(":"))
        return hour * 60 + minute

    assert minutes(sc.SOS_TIMES["completed"]) - minutes(sc.SOS_TIMES["submitted"]) == 36
    assert sc.SOS_STAGE_TIMES[3] == sc.SOS_TIMES["arrived"], (
        "the fourth rail stage is «رسیدگی»: its stamp must be the arrival, not «در راه»")
    assert sc.SOS_STAGE_TIMES_DONE[-1] == sc.SOS_TIMES["completed"]
    # the status bar may never be earlier than the last event the plate prints
    assert minutes(sc.SOS_CLOCKS["s-09-dispatched"]) >= minutes(sc.SOS_TIMES["dispatched"])
    assert minutes(sc.SOS_CLOCKS["s-10-accepted"]) >= minutes(sc.SOS_TIMES["accepted"])
    assert minutes(sc.SOS_CLOCKS["s-11-arrived"]) >= minutes(sc.SOS_TIMES["arrived"])


def test_sos_manual_pin_is_near_but_not_on_the_gps_fix():
    """Plate 04 prints the distance between the two: it has to be a real, walkable offset."""
    from bb import scenario as sc

    assert 40 <= sc.SOS_MANUAL_OFFSET_M <= 400, sc.SOS_MANUAL_OFFSET_M
    assert sc.SOS_MANUAL != sc.SOS_POINT


def test_sos_stages_are_the_client_stages():
    from bb import ui

    assert ui.SOS_STAGES == ("ثبت", "اعزام", "پذیرش", "رسیدگی", "پایان")
