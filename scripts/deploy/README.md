# Deployment control helpers

`start126.py` starts or restarts the #126 private remote Kimi deployment using a
credential from the current process environment. It sends the value only through
SSH stdin, never an argument, file or log. SSH host identity checking stays enabled.
The installed operator enforces package/process ownership and only forwards the
key to its Worker. See `apps/evidence-web/deploy/README.md` for lifecycle boundaries.
