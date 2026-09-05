---
name: test-suite
description: This skill should be used when the user asks to "write tests for", "create test suite", "test coverage for", "unit tests for", or discusses testing code comprehensively.
---

# Test Suite Creation Skill

Comprehensive test suite creation using researcher and tester agents to write thorough, meaningful tests.

## Overview

This skill creates test suites by:
1. Using the **researcher agent** to understand the code being tested
2. Using the **tester agent** to write comprehensive tests

## Workflow

### Phase 1: Code Understanding (Researcher)
1. Identify code to test (functions, classes, modules)
2. Understand inputs, outputs, and side effects
3. Map dependencies and external services
4. Note edge cases and error conditions
5. Review existing test patterns

### Phase 2: Test Creation (Tester)
1. **Unit Tests**: Test individual functions/methods
2. **Integration Tests**: Test component interactions
3. **Edge Cases**: Boundary conditions, empty inputs, nulls
4. **Error Cases**: Invalid inputs, exceptions, failures
5. **Mocking**: Mock external dependencies
6. **Assertions**: Verify behavior, not implementation

## Test Suite Output

### Test Structure
```
describe('Module Name', () => {
  describe('functionName', () => {
    it('should handle normal case', () => { ... });
    it('should handle edge case', () => { ... });
    it('should throw error on invalid input', () => { ... });
  });
});
```

### Test Categories
- **Happy path**: Normal, expected usage
- **Edge cases**: Boundary values, empty data
- **Error handling**: Invalid inputs, exceptions
- **Integration**: Component interactions

### Coverage Goals
- Critical paths: 100%
- Business logic: 90%+
- Utility functions: 80%+

## Best Practices

- **Arrange-Act-Assert**: Clear test structure
- **One assertion per test**: Focus on single behavior
- **Descriptive names**: Test name explains what it tests
- **Independent tests**: No shared state between tests
- **Mock external dependencies**: Database, APIs, file system
- **Test behavior, not implementation**: Tests survive refactoring
- **Fast tests**: Unit tests should run in milliseconds
