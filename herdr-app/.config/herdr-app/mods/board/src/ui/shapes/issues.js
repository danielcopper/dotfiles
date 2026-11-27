// The issues shape: an Issues tab's view, the owner's open or closed issues
// as one list walked as one column, grouped by repo under a group row with
// its name and count (kinds/issues.js, issueLines), or one repo's alone
// without one (its solo repo, the field „Repo:“ beside the view switch,
// ui/modals/solo.js). A row has its key, title, type and labels, session,
// milestone, assignees and age, a line across its top in its issue type's
// color, and on a closed issue a stripe at its left by why it was closed
// (closedTone). The repo menu (R) turns a repo off and on: the read leaves
// the repos turned off out, so one turned on waits for the next read, its
// group row with the spinner at the list's end. The list draws whole only
// the lines about where it stands (ui/band.js), as a table does. The data:
// parseGithubIssues's (sources/github.js). View fields it reads: id,
// settingsPath, hideRepos.

import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { NOTHING_SHOWS, ageLabel, cardLabel, findRow, withRow } from "../../shared.js";
import { withRepoView } from "../../kinds/list.js";
import { closedTone, issueLines, issueSoloSwitch, issueSwitches, issuesFromSaved, keptIssues, readsOtherRepos, savedIssues, soloKey, soloRepoOf } from "../../kinds/issues.js";
import { itemSessions } from "../../sessions.js";
import { tellOutcomes } from "../../actions/write.js";
import { unclearAssignLines } from "../../actions/assign.js";
import { linesLeftBand, scrollToLine, windowedLines, windowedState } from "../band.js";
import { groupHead, labelChip, limitNote, listRow, sessionChip, shownOf, spinner, store, toggleRepoSetting, toneChip, typeChip, typeLine } from "../helpers.js";
import { toneColor } from "../tones.js";

const issuesState = (b) => b.shapeState.issues;

const ISSUES_ASSIGN = { find: findRow, withItem: withRow, where: "in der Liste" };

// A row's and a group row's height: each is drawn this high, so the band
// needs no measure.
export const ISSUE_ROW_H = 34;
export const ISSUE_GROUP_H = 28;

const ISSUE_W = { key: 170, milestone: 140, assignees: 150, age: 70 };

const issueVisible = (b, data) => (r) => b.visible(r, data);
const issueLinesOf = (b, st) => issueLines(st.data, issueVisible(b, st.data), st.soloRepo);
const issueLineHeight = (line) => (line.row ? ISSUE_ROW_H : ISSUE_GROUP_H);
const issueNav = (b, st) => [{ id: "issues", shown: issueLinesOf(b, st).flatMap((l) => (l.row ? [l.row] : [])) }];

export const issuesShape = {
  state: windowedState,
  nav: issueNav,
  selected: (b, st) => issueNav(b, st)[0].shown.find((r) => r.key === st.sel?.key) ?? null,
  scrollTo(b, view, sel) {
    const lines = issueLinesOf(b, b.state(view.id));
    const at = lines.findIndex((l) => l.row?.key === sel.key);
    if (at >= 0) scrollToLine(issuesState(b), lines.map(issueLineHeight), at);
  },
  bandsLeft: (b) => linesLeftBand(issuesState(b)),
  items: keptIssues,
  count(b, data) {
    const rows = keptIssues(data);
    return { shown: rows.filter(issueVisible(b, data)).length, total: rows.length };
  },
  render: (b, t, mono, view, st) => drawIssues(b, t, mono, view, st),
  dirs: ["up", "down"],
  loads: true,
  received(data, st, view) {
    const shown = withRepoView(data, view);
    if (!shown.partial && st.soloRepo && !soloRepoOf(shown, st.soloRepo)) {
      st.soloRepo = null;
      store.remove(soloKey(view.id));
    }
    return shown;
  },
  withView: withRepoView,
  readsAgain: (st, view) => readsOtherRepos(st.loading && st.readFor ? st.readFor.hideRepos : st.data.readHidden, view.hideRepos),
  toggleRepo: toggleRepoSetting,
  repoSwitches: (b, data) => issueSwitches(data, issueVisible(b, data)),
  soloSwitch: (b, st) => issueSoloSwitch(st.data, st.soloRepo),
  toSaved: savedIssues,
  fromSaved: issuesFromSaved,
  warnings: () => [],
  settle: (b, view, due, data, cx) => tellOutcomes(b, unclearAssignLines(due.filter((u) => u.kind === "assign"), data, ISSUES_ASSIGN), cx),
  assign: ISSUES_ASSIGN,
};

const issueCell = (t, w, text) => div().w(w).flex_none().truncate().text_size(12).text_color(t.muted).child(text);

function drawIssues(b, t, mono, view, st) {
  const data = st.data;
  const sessions = b.sessionsNow();
  const now = Date.now();
  const lines = issueLinesOf(b, st);
  const row = (r) => {
    const session = itemSessions(sessions, r)[0] ?? null;
    const line = typeLine(t, r, null);
    const tone = closedTone(data, r);
    const chips = [typeChip(t, r), ...r.labels.map((l) => labelChip(t, r, l))].filter(Boolean).map((c) => c.flex_none());
    return listRow(b, t, view, st, r, tone ? toneColor(t, tone) : t.background)
      .h(ISSUE_ROW_H)
      .child(div().w(ISSUE_W.key).flex_none().truncate().font_family(mono).text_size(11.5).text_color(t.muted).child(cardLabel(r)))
      .child(h_flex().flex_1().min_w(0).gap(8).items_center().overflow_hidden()
        .child(div().min_w(0).truncate().child(r.title))
        .children(chips)
        .when(Boolean(session), (el) => el.child(sessionChip(t, session).flex_none())))
      .child(h_flex().w(ISSUE_W.milestone).flex_none().min_w(0).when(Boolean(r.milestone), (el) => el.child(toneChip(t, r.milestone, "muted").min_w(0).truncate())))
      .child(issueCell(t, ISSUE_W.assignees, r.assignees.join(", ")))
      .child(issueCell(t, ISSUE_W.age, ageLabel(r.updatedAt, now)))
      .when(Boolean(line), (el) => el.child(line));
  };
  const groupRow = (l) => {
    const head = groupHead(t, l.group, l.waiting ? "" : shownOf(l.shown, l.held)).id(`group-${l.group.id}`).h(ISSUE_GROUP_H).px(20);
    if (!l.waiting) return head;
    const said = div().text_size(12).text_color(t.muted);
    return st.loading ? head.child(spinner()).child(said.child("Lädt …")) : head.child(said.child(`nicht gelesen – ${b.keyShown("reload")} liest neu`));
  };
  const list = windowedLines(issuesState(b), "issue-rows", lines, lines.map(issueLineHeight), (l) => (l.row ? row(l.row) : groupRow(l)));
  const box = v_flex().id("issues-box").flex_1().min_h(0);
  if (!list) {
    const what = keptIssues(data).length ? NOTHING_SHOWS : data.partial ? null : data.meta.state === "closed" ? "Keine geschlossenen Issues" : "Keine offenen Issues";
    return box.when(Boolean(what), (el) => el.child(div().p(20).text_color(t.muted).child(what)));
  }
  const note = limitNote(t, data, `Nur die ersten ${data.count} von ${data.total} Issues`);
  return box.child(list).when(Boolean(note), (el) => el.child(note));
}
