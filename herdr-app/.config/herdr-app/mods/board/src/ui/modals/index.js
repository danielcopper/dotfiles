// The dialogs drawn over the board, by b.modal.kind: each has render(b, t)
// and key(b, e, cx), which gets every key but Esc (the Board closes a dialog
// on Esc unless it is busy). A dialog keeps its state, and makes the inputs
// it needs, in b.modal; one that belongs to a view keeps it as b.modal.view,
// and r closes it when views.json no longer has that view of that kind. A
// new dialog is a module here and its entry in MODALS.

import { startModal } from "./start.js";
import { statusModal } from "./status.js";

export const MODALS = { start: startModal, status: statusModal };
