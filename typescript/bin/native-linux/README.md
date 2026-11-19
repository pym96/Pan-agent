# Linux workspace helper

Pan launches `workspace.py` with the system Python in isolated mode inside a private Bubblewrap supervisor. The FUSE view and the task's inner namespace exist only for the lifetime of that command. See the [source design](https://github.com/pym96/Pan-agent/blob/main/docs/design/native-linux-sandbox.md) for the environment, supported operations and installation prerequisites.

`fuse.py` is the unmodified pure-Python binding from [fusepy 3.0.1](https://pypi.org/project/fusepy/3.0.1/). Its ISC license and copyright notice appear at the top of the distributed file. The upstream source distribution SHA-256 is `72ff783ec2f43de3ab394e3f7457605bf04c8cf288a2f4068b4cde141d4ee6bd`. The extracted `fuse.py` SHA-256 is `7a7b60998bd459d5bbe6fcd8d4886fa4d3784d58bd8209db4f83ebee7299af87`. No pip installation or network fetch occurs when Pan is installed or run.

In the network-enabled native profile, the task namespace sees one Unix GET gateway and its own local Unix sockets. IP sockets stay denied by seccomp. See [native networking](../../../docs/design/native-network.md).
