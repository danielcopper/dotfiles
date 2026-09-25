<!-- Comment for https://github.com/hiroppy/tmux-agent-sidebar/pull/142 - delete after posting -->

Thanks for this.

One thought on the design: `repo` and `session` are both useful, but in my setup I'd want both at once. I usually keep one tmux session per topic (a review, a feature, a support thread), and several of them work in the same repo. Grouping by repo keeps related agents together. But then I can't tell which session a row belongs to without switching to it. Grouping by session gives me that, but loses the repo view.

Would a third mode fit here? Something like `@sidebar_group_by repo+session`, or a separate `@sidebar_show_session on`. It would keep the repo groups and show the tmux session name on each agent row, for example next to the branch (`main · review`). The data is already there, since `group_panes` has the session for every pane.

Happy to help with a follow-up PR if that's something you'd take.
