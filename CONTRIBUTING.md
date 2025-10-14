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
2. Create a new branch: `git checkout -b feature/your-feature-name`
3. Make your changes
4. Run tests and linting: `npm run lint && npm run build`
5. Commit your changes with a descriptive message
6. Push to your fork: `git push origin feature/your-feature-name`
7. Create a pull request

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

## Commit Message Guidelines

Use clear and descriptive commit messages:

- `feat: Add new feature`
- `fix: Fix bug in connection manager`
- `docs: Update README`
- `style: Format code`
- `refactor: Restructure tool manager`
- `test: Add tests for settings`
- `chore: Update dependencies`

## Testing

Currently, we're establishing the testing infrastructure. When adding new features:

1. Consider how it can be tested
2. Manually test your changes
3. Document test scenarios

## Documentation

When adding new features:

1. Update README.md if needed
2. Update TOOL_DEVELOPMENT.md for tool-related changes
3. Add inline code comments
4. Update type definitions

## Release Process

(To be established)

## Questions?

If you have questions, feel free to:
- Open an issue for discussion
- Reach out to maintainers

Thank you for contributing!
