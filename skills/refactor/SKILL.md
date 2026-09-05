---
name: refactor
description: This skill should be used when the user asks to "refactor this", "clean up code", "improve maintainability", "fix code smells", or discusses improving code structure and quality.
---

# Safe Code Refactoring Skill

Safe code refactoring using researcher, optimizer, and tester agents to improve code quality while preserving functionality.

## Overview

This skill refactors code by:
1. Using the **researcher agent** to understand the code
2. Using the **optimizer agent** to refactor
3. Using the **tester agent** to verify functionality

## Workflow

### Phase 1: Understanding (Researcher)
1. Read and understand code to refactor
2. Identify code smells and issues
3. Map dependencies and usage
4. Check existing tests
5. Note project patterns and conventions

### Phase 2: Refactoring (Optimizer)
1. **Extract functions**: Break down long functions
2. **Rename**: Clarify variable/function names
3. **Remove duplication**: DRY principle
4. **Simplify conditionals**: Guard clauses, early returns
5. **Apply patterns**: Use appropriate design patterns
6. **Improve structure**: Organize code logically
7. **Document**: Add comments for non-obvious logic

### Phase 3: Verification (Tester)
1. Run existing tests
2. Add tests if coverage is lacking
3. Verify all tests pass
4. Check for regressions

## Refactoring Output

### Code Smells Identified
- Long functions
- Duplicated code
- Complex conditionals
- Poor naming
- God objects

### Refactoring Changes
- Before/after comparison
- Improvements made
- Patterns applied

### Test Results
- All tests passing
- New tests added (if needed)
- Coverage maintained or improved

## Common Refactorings

- **Extract Method**: Pull out logic into separate function
- **Extract Variable**: Name intermediate results
- **Inline**: Remove unnecessary indirection
- **Rename**: Improve clarity
- **Move**: Organize code better
- **Replace Conditional with Polymorphism**: Use OOP
- **Replace Magic Numbers**: Use named constants

## Best Practices

- **Small steps**: Refactor incrementally
- **Tests first**: Ensure tests pass before starting
- **One change at a time**: Easier to debug if something breaks
- **Preserve behavior**: Refactoring should not change functionality
- **Run tests frequently**: After each small change
- **Commit often**: Small, focused commits
- **Review diffs**: Ensure changes make sense
