// The dialogs drawn over the board, by b.modal.kind: each has render(b, t)
// and key(b, e, cx), which gets every key but Esc (the Board closes a dialog
// on Esc unless it is busy). A dialog keeps its state, and makes the inputs
// it needs, in b.modal; one that belongs to a view keeps it as
// b.modal.view, and a reload that finishes while it is open closes it when
// views.json no longer has that view of that kind. A dialog with fields
// also has tab(b, back, cx), which Tab and shift-Tab (`back`) call to move
// between them (Board.dialogTab). A new dialog is a module here and its
// entry in MODALS.

import { columnsModal } from "./columns.js";
import { createModal } from "./create.js";
import { startModal } from "./start.js";
import { statusModal } from "./status.js";

export const MODALS = { start: startModal, status: statusModal, columns: columnsModal, create: createModal };
