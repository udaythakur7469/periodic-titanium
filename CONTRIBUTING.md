# Contributing to Periodic Titanium

Thank you for considering contributing to @periodic/titanium! This document provides guidelines for contributing to the project.

## 🎯 Code of Conduct

Be respectful, constructive, and professional in all interactions.

## 🚀 Getting Started

### Prerequisites

- Node.js >= 14.0.0
- Redis server (local or remote)
- npm or yarn

### Setup Development Environment

1. **Fork the repository**
   ```bash
   git clone https://github.com/thaku7469/periodic-titanium.git
   cd periodic-titanium
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start Redis (if not already running)**
   ```bash
   # Using Docker
   docker run --name redis-dev -p 6379:6379 -d redis:alpine
   
   # Or install locally
   # macOS: brew install redis && brew services start redis
   # Linux: sudo apt-get install redis-server && sudo service redis-server start
   ```

4. **Build the project**
   ```bash
   npm run build
   ```

5. **Run tests**
   ```bash
   npm test
   ```

## 📝 Development Workflow

### Project Structure

```
@periodic/titanium/
├── src/
│   ├── core/           # Framework-agnostic rate limiting logic
│   ├── adapters/       # Framework adapters (Express, etc.)
│   ├── utils/          # Utility functions
│   └── index.ts        # Public API exports
├── examples/           # Usage examples
├── dist/               # Compiled output (gitignored)
└── tests/              # Test files (to be added)
```

### Making Changes

1. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**
   - Follow existing code style
   - Add tests for new features
   - Update documentation as needed

3. **Run linting and formatting**
   ```bash
   npm run lint
   npm run format
   ```

4. **Build and test**
   ```bash
   npm run build
   npm test
   ```

5. **Commit your changes**
   ```bash
   git add .
   git commit -m "feat: add new feature"
   ```
   
   Follow [Conventional Commits](https://www.conventionalcommits.org/) format:
   - `feat:` New feature
   - `fix:` Bug fix
   - `docs:` Documentation changes
   - `refactor:` Code refactoring
   - `test:` Test additions/changes
   - `chore:` Build process or tooling changes

6. **Push to your fork**
   ```bash
   git push origin feature/your-feature-name
   ```

7. **Create a Pull Request**
   - Provide a clear description of changes
   - Reference any related issues
   - Ensure CI checks pass

## 🧪 Testing Guidelines

### Writing Tests

Tests should cover:
- Core rate limiting logic
- Edge cases (Redis failures, concurrent requests, etc.)
- Different configuration options
- IP extraction utilities

Example test structure:
```typescript
describe('RateLimiter', () => {
  let redis: RedisClientType;
  let limiter: RateLimiter;

  beforeAll(async () => {
    redis = createClient();
    await redis.connect();
  });

  afterAll(async () => {
    await redis.quit();
  });

  beforeEach(async () => {
    await redis.flushAll(); // Clean state
    limiter = new RateLimiter({
      redis,
      limit: 10,
      window: 60,
      keyPrefix: 'test'
    });
  });

  test('should allow requests within limit', async () => {
    const result = await limiter.limit('user-123');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
  });

  test('should block requests after limit exceeded', async () => {
    // Make 10 requests
    for (let i = 0; i < 10; i++) {
      await limiter.limit('user-123');
    }
    
    // 11th request should be blocked
    const result = await limiter.limit('user-123');
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });
});
```

## 📚 Documentation

### Updating README

When adding features:
1. Add usage example to README
2. Update API reference section
3. Add to relevant configuration table
4. Update changelog

### Code Documentation

- Use JSDoc comments for all public APIs
- Include `@param`, `@returns`, `@throws` where applicable
- Provide usage examples in comments

Example:
```typescript
/**
 * Extract client IP address from Express request
 * 
 * @param req - Express request object
 * @returns IP address string
 * 
 * @example
 * ```typescript
 * const ip = extractClientIp(req);
 * console.log(ip); // "192.168.1.1"
 * ```
 */
export function extractClientIp(req: Request): string {
  // Implementation
}
```

## 🎨 Code Style

### TypeScript

- Use TypeScript strict mode
- Prefer interfaces over types for object shapes
- Use explicit return types for public functions
- Avoid `any` unless absolutely necessary (use `unknown` instead)

### Formatting

- 2 spaces for indentation
- Single quotes for strings
- Semicolons required
- Max line length: 80 characters
- Trailing commas in multiline structures

Run `npm run format` to auto-format code.

### Naming Conventions

- `camelCase` for variables and functions
- `PascalCase` for classes and types
- `UPPER_SNAKE_CASE` for constants
- Descriptive names (avoid abbreviations unless common)

## 🐛 Bug Reports

When reporting bugs, include:

1. **Description:** Clear description of the issue
2. **Steps to reproduce:** Minimal code example
3. **Expected behavior:** What should happen
4. **Actual behavior:** What actually happens
5. **Environment:**
   - Node.js version
   - Redis version
   - Package version
   - Operating system

## 💡 Feature Requests

For feature requests:

1. **Use case:** Why is this feature needed?
2. **Proposed solution:** How should it work?
3. **Alternatives:** Other approaches considered
4. **Breaking changes:** Will this break existing code?

## 🔄 Pull Request Process

1. **Ensure tests pass:** All CI checks must pass
2. **Update documentation:** README, JSDoc, examples
3. **Add changelog entry:** In CHANGELOG.md
4. **Follow commit conventions:** Use conventional commits
5. **Request review:** Assign maintainers for review

### PR Checklist

- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] Changelog updated
- [ ] Code formatted (`npm run format`)
- [ ] Linting passes (`npm run lint`)
- [ ] Build succeeds (`npm run build`)
- [ ] No breaking changes (or clearly documented)

## 🚫 Non-Goals

The following are **intentionally** not included and PRs for them will be declined:

- Sliding window log algorithm (may be added in v2.x)
- In-memory fallback mode
- Built-in metrics/tracing (use external tools)
- Framework auto-detection
- Redis clustering logic (use Redis Cluster)

## 📞 Getting Help

- 💬 **Discussions:** For questions and general discussion
- 🐛 **Issues:** For bug reports
- 📧 **Email:** For security concerns

## 🙏 Recognition

Contributors will be added to the README and package.json contributors list.

Thank you for contributing! 🎉