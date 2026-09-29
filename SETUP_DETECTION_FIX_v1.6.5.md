# Setup Detection Fix v1.6.5

`/setup` was finding almost no channels because the normalization regex in v1.6.4 was over-escaped. It could transform names like `support` into `pp`.

This version fixes Unicode/fancy-font normalization, removes the hard dependency on Read Message History, and keeps conservative anti-misclassification rules.

After deployment run `/commandsync` once if needed, then run `/setup`.
