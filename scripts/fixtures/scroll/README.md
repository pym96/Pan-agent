# Scroll layout verification fixture

[scroll-pty-driver.mjs](scroll-pty-driver.mjs): installed-product PTY driver for #62. Real `DailyWorkspace` with an 800-line streamed Faux transcript; records raw PTY output, dimensions, per-`scroll()` timing samples, layout build/visit counters and final state. [`../../verify_scroll_pty.py`](../../verify_scroll_pty.py) drives it through twenty wheel reports, resizes and Ctrl-End with screen reconstruction and zero-meter guards. Synthetic offline data, not a Provider result.
