# Contributing to PowerPlatform ToolBox

Thank you for your interest in contributing to PowerPlatform ToolBox! This document provides guidelines and instructions for contributing.

## Code of Conduct

Be respectful and considerate of others. We aim to build a welcoming and inclusive community.

## How to Contribute

### Reporting Bugs

If you find a bug, please create an issue with:
- A clear title and description
- Steps to reproduce the issue
- Expected vs actual behavior
- Screenshots if applicable
- Your environment (OS, Node version, etc.)

### Suggesting Features

Feature suggestions are welcome! Please create an issue describing:
- The problem you're trying to solve
- Your proposed solution
- Any alternatives you've considered
- Why this would be valuable to users

### Pull Requests

1. Fork the repository
2. Create a new branch following the naming convention:
   - For new features: `feature/<short-description>` (e.g., `feature/add-connection-export`)
   - For bug fixes: `fix/<issue-description>` (e.g., `fix/tool-loading-error`)
   - For documentation: `docs/<description>` (e.g., `docs/update-api-guide`)
   - For refactoring: `refactor/<description>` (e.g., `refactor/tool-manager`)
   - For chores/maintenance: `chore/<description>` (e.g., `chore/update-dependencies`)
3. Make your changes
4. Run tests and linting: `npm run lint && npm run build`
5. Commit your changes with a descriptive message following conventional commits format
6. Push to your fork: `git push origin <branch-name>`
7. Create a pull request with a clear title and description:
   - PR Title format: `[Type] Brief description` (e.g., `[Feature] Add connection export functionality`)
   - PR Types: `[Feature]`, `[Fix]`, `[Docs]`, `[Refactor]`, `[Chore]`, `[Test]`
   - Include a description of what changed and why
   - Reference any related issues using `#issue-number`

## Development Setup

1. Clone the repository:
```bash
git clone https://github.com/PowerPlatform-ToolBox/desktop-app.git
cd desktop-app
```

2. Install dependencies:
```bash
npm install
```

3. Build the application:
```bash
npm run build
```

4. Run the application:
```bash
npm start
```

## Development Workflow

### Running in Development Mode

```bash
npm run dev
```

### Building

```bash
npm run build
```

### Linting

```bash
npm run lint
```

### Watching for Changes

```bash
npm run watch
```

In a separate terminal:
```bash
npm start
```

## Project Structure

```
desktop-app/
├── src/
│   ├── api/           # ToolBox API layer
│   ├── main/          # Main Electron process
│   ├── renderer/      # UI/Renderer process
│   └── types/         # TypeScript type definitions
├── assets/            # Static assets
├── dist/              # Compiled output
└── build/             # Build artifacts
```

## Coding Standards

- Use TypeScript for all new code
- Follow existing code style and conventions
- Add comments for complex logic
- Use meaningful variable and function names
- Keep functions small and focused

## TypeScript Guidelines

- Enable strict mode
- Avoid using `any` when possible
- Define interfaces for complex objects
- Export types that may be used by tools

## Branch Naming Convention

Use the following prefixes for branch names:

- `feature/` - For new features (e.g., `feature/add-connection-export`)
- `fix/` - For bug fixes (e.g., `fix/tool-loading-error`)
- `docs/` - For documentation changes (e.g., `docs/update-api-guide`)
- `refactor/` - For code refactoring (e.g., `refactor/tool-manager`)
- `chore/` - For maintenance tasks (e.g., `chore/update-dependencies`)
- `test/` - For test additions or updates (e.g., `test/add-unit-tests`)

## Commit Message Guidelines

Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

Format: `<type>(<scope>): <subject>`

Examples:
- `feat: add connection export functionality`
- `feat(tools): add tool verification system`
- `fix: resolve tool loading error on startup`
- `fix(connections): handle invalid connection URLs`
- `docs: update README with new API examples`
- `docs(api): add missing type definitions`
- `style: format code according to ESLint rules`
- `refactor: restructure tool manager for better maintainability`
- `refactor(auth): simplify authentication flow`
- `test: add unit tests for settings manager`
- `chore: update dependencies to latest versions`
- `chore(build): update TypeScript configuration`

**Types:**
- `feat` - New features
- `fix` - Bug fixes
- `docs` - Documentation changes
- `style` - Code style changes (formatting, etc.)
- `refactor` - Code refactoring without changing functionality
- `test` - Test additions or updates
- `chore` - Maintenance tasks, dependency updates, build changes
- `perf` - Performance improvements
- `ci` - CI/CD changes

## Testing

Currently, we're establishing the testing infrastructure. When adding new features:

1. Consider how it can be tested
2. Manually test your changes
3. Document test scenarios

## Documentation

When adding new features:

1. Update README.md if it affects user-facing functionality
2. Update [TOOL_DEVELOPMENT.md](TOOL_DEVELOPMENT.md) for tool-related changes
3. Update [ARCHITECTURE.md](ARCHITECTURE.md) for architectural changes
4. Update [TOOL_HOST_ARCHITECTURE.md](TOOL_HOST_ARCHITECTURE.md) for Tool Host changes
5. Add inline code comments for complex logic
6. Update type definitions in `src/types/`

All documentation files are located in the `docs/` directory.

## Release Process

(To be established)

## Questions?

If you have questions, feel free to:
- Open an issue for discussion
- Reach out to maintainers

Thank you for contributing!
