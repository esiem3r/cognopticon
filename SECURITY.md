# Security Policy

Cognopticon is a local-first project. The public repository ships only sanitized demo data; personal workspace state is generated under `.cognopticon/` and must stay out of commits, screenshots, demos, and issue reports.

## Supported Versions

Until the first public release is tagged, security fixes target the main development branch.

## Reporting

Do not paste private workspace paths, generated `.cognopticon/` files, daemon tokens, logs with secrets, or exploit details into public issues.

If GitHub private vulnerability reporting is enabled for the repository, use that channel. Otherwise, open a minimal public issue that says you have a security report and omit sensitive details until a private channel is available.

## Local Daemon Boundary

The daemon is intended for loopback-only local use. Security-sensitive behavior includes:

- binding only to `127.0.0.1`
- requiring a daemon token for configured dev-server origins
- constraining file operations to configured roots
- running commands with `shell: false`
- allowing only verification-shaped commands by default
- rejecting destructive markers such as `--force`, `-rf`, `reset`, `push`, `commit`, and `delete`
- keeping generated local state out of public assets

Run `npm run validate:release` before sharing builds, screenshots, tarballs, or repository branches publicly.
