"""Dependency-collision risk rule: open tasks due before a prerequisite that is still open."""

import pytest

from app.domain.risk_rules import RISK_RULES, rule_dependency_collision
from app.domain.risks import evaluate_event_risks

REF = "2026-06-01"


def _task(task_id, title, due, status="todo", deps=None):
    return {"id": task_id, "title": title, "due_date": due, "status": status, "depends_on": deps}


def _risks(*tasks):
    return rule_dependency_collision({"tasks": list(tasks)}, {})


def _pair(pre_due="2026-09-10", post_due="2026-09-01", **post):
    pre = _task("a", "Pre", pre_due)
    return pre, {**_task("b", "Post", post_due, deps=["a"]), **post}


def test_rule_is_registered_after_overdue_and_before_vendor_fees():
    names = [rule.__name__ for rule in RISK_RULES]
    assert names.index("rule_dependency_collision") == names.index("rule_overdue_milestones") + 1


def test_no_tasks_no_risk():
    assert rule_dependency_collision({}, {}) == []
    assert rule_dependency_collision({"tasks": "nope"}, {}) == []
    assert _risks() == []


def test_one_collision_has_the_documented_shape():
    (risk,) = _risks(*_pair())
    assert risk["id"] == "risk-dependency-collision"
    assert risk["type"] == "dependency_collision"
    assert risk["severity"] == "warning"
    assert risk["status"] == "open"
    assert risk["title"] == "1 Dependency Collision(s)"
    assert risk["evidence"] == "Due before a prerequisite that is still open: 'Post'."
    assert [a["action_type"] for a in risk["recommended_actions"]] == ["open_timeline", "ask_mara"]


def test_equal_due_dates_are_not_a_collision():
    assert _risks(*_pair(pre_due="2026-09-10", post_due="2026-09-10")) == []


def test_one_day_earlier_is_a_collision():
    assert len(_risks(*_pair(pre_due="2026-09-11", post_due="2026-09-10"))) == 1


def test_dependent_after_prerequisite_is_fine():
    assert _risks(*_pair(pre_due="2026-09-01", post_due="2026-09-10")) == []


def test_three_titles_are_listed_without_a_suffix():
    tasks = [_task("p", "Pre", "2026-09-10")]
    tasks += [_task(f"d{i}", f"Dep {i}", "2026-09-01", deps=["p"]) for i in range(3)]
    (risk,) = _risks(*tasks)
    assert risk["title"] == "3 Dependency Collision(s)"
    assert risk["evidence"].endswith("'Dep 0', 'Dep 1', 'Dep 2'.")


def test_many_collisions_list_three_titles_and_the_remaining_count():
    tasks = [_task("p", "Pre", "2026-09-10")]
    tasks += [_task(f"d{i}", f"Dep {i}", "2026-09-01", deps=["p"]) for i in range(6)]
    (risk,) = _risks(*tasks)
    assert risk["title"] == "6 Dependency Collision(s)"
    assert risk["evidence"] == (
        "Due before a prerequisite that is still open: 'Dep 0', 'Dep 1', 'Dep 2' and 3 more."
    )


def test_a_task_colliding_with_two_prerequisites_counts_once():
    tasks = [
        _task("a", "A", "2026-09-10"),
        _task("c", "C", "2026-09-12"),
        _task("b", "Post", "2026-09-01", deps=["a", "c"]),
    ]
    assert _risks(*tasks)[0]["title"] == "1 Dependency Collision(s)"


@pytest.mark.parametrize(
    "mutate",
    [
        {"status": "done"},
        {"depends_on": ["ghost"]},
        {"depends_on": "a"},
        {"depends_on": None},
        {"depends_on": [["a"], {"x": 1}, None]},
        {"due_date": "not-a-date"},
        {"due_date": ""},
        {"due_date": None},
        {"due_date": "2026-02-30"},
    ],
)
def test_ignored_inputs_raise_nothing(mutate):
    assert _risks(*_pair(**mutate)) == []


def test_done_prerequisite_is_ignored():
    pre, post = _pair()
    assert _risks({**pre, "status": "done"}, post) == []


def test_invalid_prerequisite_date_is_ignored():
    pre, post = _pair()
    assert _risks({**pre, "due_date": "soon"}, post) == []


def test_self_dependency_and_junk_entries_are_ignored():
    own = _task("a", "Loop", "2026-09-10", deps=["a"])
    assert _risks(own, None, 5, "x", [], {"title": "no id"}) == []


def test_untitled_tasks_fall_back_to_their_id():
    pre, post = _pair()
    (risk,) = _risks(pre, {**post, "title": ""})
    assert risk["evidence"] == "Due before a prerequisite that is still open: 'b'."


def test_datetime_due_dates_compare_by_day():
    (risk,) = _risks(*_pair(pre_due="2026-09-11T00:00:00", post_due="2026-09-10T23:59:59"))
    assert risk["id"] == "risk-dependency-collision"
    assert _risks(*_pair(pre_due="2026-09-10T23:00:00", post_due="2026-09-10T01:00:00")) == []


def test_unicode_titles_pass_through_as_plain_text():
    pre, post = _pair()
    (risk,) = _risks(pre, {**post, "title": "Café <b>花</b>"})
    assert "'Café <b>花</b>'" in risk["evidence"]


def test_aggregator_orders_collision_between_critical_and_notice():
    event = {
        "expected_guests": 500,
        "venue_capacity": 100,
        "tasks": list(_pair()),
        "vendors": [{"id": "v", "name": "V", "status": "shortlist"}],
    }
    report = evaluate_event_risks(event, REF)
    assert [r["id"] for r in report["risks"]] == [
        "risk-capacity-breach",
        "risk-dependency-collision",
        "risk-vendor-missing-v",
    ]
    assert report["warning_count"] == 1


def test_dismissed_collision_is_removed():
    event = {"tasks": list(_pair()), "dismissed_risk_ids": ["risk-dependency-collision"]}
    assert evaluate_event_risks(event, REF)["total_count"] == 0
