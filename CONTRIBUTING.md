# Contributing to FDX

Thank you for your interest in contributing to FDX. This document outlines how to get started.

## Development Setup

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for instructions on running the project from source.

## Workflow

1. Fork the repository
2. Create a feature branch from `main`
3. Make your changes
4. Run tests and linting:
   ```bash
   npm test
   npm run lint
   ```
5. Submit a pull request against `main`

## Code Style

- This project uses [Prettier](https://prettier.io/) for formatting and [ESLint](https://eslint.org/) for linting.
- Run `npm run format` to auto-format your code.
- Run `npm run lint:fix` to auto-fix lint issues.
- All code must pass `npm run lint` before merging.

## Commit Messages

Use clear, descriptive commit messages. Prefer the imperative mood:

- `Fix token refresh when access token is expired`
- `Add support for Solana chain key`

## Reporting Issues

- Use [GitHub Issues](https://github.com/financedistrict-platform/fd-agent-wallet-cli/issues) to report bugs or request features.
- Include steps to reproduce, expected vs. actual behavior, and your Node.js version.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
