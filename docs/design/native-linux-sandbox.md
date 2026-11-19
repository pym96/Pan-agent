# Native Linux workspace sandbox

The interactive `--native-sandbox` option uses Bubblewrap and a filtered FUSE mount on supported x86-64 Linux. Typed file tools edit the selected host directory. Shell sees the same files under `/work`. A script can create an output, atomically replace a project file and read the change back through a typed tool. This option applies to the current source and packages built from it. The published v0.1.9 package predates the option.

```sh
pan-agent --native-sandbox --workspace /absolute/project --memory-root /absolute/disjoint/archives
```

## System requirements

Use Node 22.19.0 or newer, an interactive terminal and a local Linux project directory. The exercised configuration is Ubuntu 22.04 x86-64, Linux 6.8, ext4, Bubblewrap 0.10.0, FUSE 3's fusermount utility, libfuse **2**'s compatibility ABI, libseccomp 2 and the system Python 3.10 interpreter. The host must allow the current account to create user, network, PID, IPC, UTS and mount namespaces, open `/dev/fuse`, and mount FUSE in its own user namespace. The helper requires the standard x86-64 glibc system tool locations and working `/usr/bin/ldd`.

For an Ubuntu machine managed by an administrator, the package names are `bubblewrap`, `fuse3`, `libfuse2`, `libseccomp2`, `libc-bin` and `python3`. Versions, distro layouts, LSM policy and kernel configuration can affect availability. The Bubblewrap build must accept the flags used by the launcher, including `--clearenv`. Pan checks a real isolated Node computation at task admission. Missing prerequisites produce a setup diagnostic before the first model exchange or file tool. If the host disallows unprivileged namespaces, use an environment whose administrator supports this mode. Pan changes no host settings. The installed package contains the Python helper and its pinned binding and needs no runtime download, compiler or checkout.

## Which resources reach Shell

Each Shell invocation starts a short-lived, trusted supervisor in fresh Bubblewrap mount, PID, IPC, UTS and network namespaces. It gets the host project at `/source`, this run's private temp directory, the packaged helper and policy, the running Node executable, a readonly system `/usr` for Python/Bubblewrap and their loader, private proc/dev/tmp, and `/dev/fuse`. Its namespace-local mount capability lets it mount the filtered view. The Python process does not evaluate the command text. It passes the arguments to a second Bubblewrap launch which drops capabilities, starts a new session and PID namespace, and installs a libseccomp filter before starting Bash.

The task and its descendants get these mounts:

| Resource in Shell | Authority |
| --- | --- |
| `/work` | Read/write filtered view of the live project. Host-mediated tools use ordinary host paths or paths relative to the selected workspace. |
| `/tmp` | Private directory shared across this run's Shell calls. `HOME` and `TMPDIR` both point here. Its host directory is removed after settlement. |
| `/runtime/node` | Readonly bind of the running Node executable. |
| `/usr/bin` entries and `/bin` alias | Individual readonly binds of Bash, sh and a fixed utility list. The list and actual library paths are recorded in the run identity. |
| System loader and ELF libraries | Individual readonly files required by those executables, resolved with a cleaned environment. Libraries outside the supported system library location reject startup. No whole library or executable directory is bound into the task. |
| `/dev/null`, `zero`, `random`, `urandom` | Four explicit devices. The host terminal, FUSE device and supervisor proc filesystem stay outside the task. |

The child receives a constructed PATH, HOME, TMPDIR, C locale and `OPENSSL_CONF=/dev/null`. Standard input is closed and standard output/error use capture pipes. Sensitive environment variables, host file descriptors, socket handles, archive directories, arbitrary toolchains, the host home and the raw backing project are outside the child view. The seccomp policy denies socket creation and connection (including Unix domain sockets), io_uring setup, new namespaces and selected privileged interfaces. The existing approval and deny-rule checks apply before dispatch. Approval cannot broaden these mounts, environment or networking. Retrieval is unavailable in this mode. The host-side provider and Pan process retain their own existing authority.

## Filesystem behavior

Each lookup walks the live project using pinned directory descriptors and no-follow opens. The view rejects symlinks, multiply linked regular files, special files and nested mount crossings. A successful open is checked against the observed mount, device, inode and link count. Directory entries have zero lookup/attribute cache time and file reads and writes use direct I/O. The host and Shell observe the same backing bytes. Ordinary directories support traversal, listing, creation and empty-directory removal. Regular files support creation, read/write, chmod, unlink and atomic replacement. Directory rename, symlink/hardlink creation, special-file creation and extended attributes are outside the supported interface. Use regular-file project fixtures; dependency trees that rely on symlinks may need a different environment.

Both the view and typed tools deny case-insensitive reserved path components: `.git`, `.ssh`, `.pan-agent`, `.npmrc`, `.env`, `.env.*`, `*.pem`, `*.key`, `id_rsa` and `id_ed25519`. Every configured protected root must be a literal strict descendant of the selected project. Each accepted host root produces one matching child deny rule, including the full suffix of a future path. Parent traversal, aliased ancestors, hardlinks, special files and nested mount crossings reject admission. **Even an ordinary external path in saved `protectedPaths` prevents Linux native startup.** The diagnostic leaves the settings intact. The mode currently requires case-sensitive ext4 directories along the configured roots, checked before Shell admission with the kernel's directory flags. This makes the identity of future descendants determinate. A workspace without configured roots keeps its ordinary runtime preflight. Existing host tools retain their handle checks. Select a project and private archive directory controlled by the current user. The supported environment assumes trusted system tools, package files, kernel, and no concurrent hostile host modification of project paths or install/state directories.

## Lifecycle and evidence

The run archives the backend `bubblewrap-fuse`, mode `native-linux-offline`, runtime files and policy hash. A private `native-sandbox/RUN_ID` under the disjoint archive root retains the policy and identity. A Shell command starts with a fresh namespace and FUSE daemon. On exit or cancellation the outer PID namespace tears down its descendants and the private mount disappears. Controlled cancellation tests check a positive start marker, terminal status and absence of the child's delayed effect. CPU, memory, PID and disk quotas are outside this mode's contract. An interpreter/compiler missing from the explicit runtime may fail. Session archives remain available after normal cleanup.

The normal host mode, macOS Seatbelt backend, Docker mode and scheduled `loop`/`goal`/`execution` paths keep their prior interfaces. Ordinary Linux CI may be restricted. Use the required-real checks on a supported host to distinguish actual enforcement from an unsupported-runner refusal.

- Run `PAN_REQUIRE_NATIVE_LINUX=1 node --experimental-strip-types --test typescript/test/native-linux.test.ts` for real project/temp operations, host and child denial, network and controlled cancellation.
- Run `node scripts/runtime-ci/native-macos.mjs INSTALLED_PACKAGE NEW_OUTPUT` on either supported OS for the installed CLI/TUI, four scripted model exchanges, real backend, typed readback and sealed archive. The historical script name is retained for existing callers.
- The unavailable fixture `scripts/runtime-ci/native-linux-unavailable.mjs` takes an installed package and fresh output directory. Run it inside a private fixture missing FUSE or denying user namespaces. It asserts the failed archive, zero model exchanges, an empty workspace and temp cleanup.

[WorkOrder and review](https://github.com/pym96/Pan-agent/issues/173) · [Builder evidence](../evidence/native173/README.md) · [Bubblewrap](https://github.com/containers/bubblewrap) · [libfuse](https://github.com/libfuse/libfuse) · [fusepy](https://github.com/fusepy/fusepy)
