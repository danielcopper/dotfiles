// The dialogs drawn over the board, by b.modal.kind: each has render(b, t)
// and key(b, e, cx), which gets every key but Esc (the Board closes a dialog
// on Esc unless it is busy, or unless its escape(b, cx) took Esc: Esc in a
// choice's open list closes only the list). A dialog keeps its state, and
// makes the inputs it needs, in b.modal; one that belongs to a view keeps
// it as b.modal.view, and a reload that finishes while it is open closes it
// when the config no longer has that view of that kind. A dialog with
// fields also has tab(b, back, cx), which Tab and shift-Tab (`back`) call
// to move between them (Board.tabKey). Optional: keys, the key bindings
// Board.bindKeys binds for it, and keyboard(m), the input that takes the
// keyboard before its fields (Board.takeKeyboard). A new dialog is a module
// here and its entry in MODALS.

import { assignModal } from "./assign.js";
import { columnsModal } from "./columns.js";
import { commandsModal } from "./commands.js";
import { createModal } from "./create.js";
import { reposModal } from "./repos.js";
import { sprintsModal } from "./sprints.js";
import { startModal } from "./start.js";
import { sessionsModal } from "./sessions.js";
import { statusModal } from "./status.js";

export const MODALS = { start: startModal, status: statusModal, columns: columnsModal, create: createModal, assign: assignModal, commands: commandsModal, sprints: sprintsModal, sessions: sessionsModal, repos: reposModal };
