---
name: code-review
description: This skill should be used when the user asks to "review this code", "code review for", "check this implementation", mentions "code quality", or discusses reviewing code for best practices, security, or performance.
---

# Code Review Skill

Comprehensive code review using researcher and optimizer agents to analyze code quality, security, performance, and maintainability.

## Overview

This skill performs a thorough code review by:
1. Using the **researcher agent** to understand the code context and patterns
2. Using the **optimizer agent** to analyze quality, security, and performance

## Workflow

### Phase 1: Context Gathering (Researcher)
1. Identify the code to review (files, functions, or modules)
2. Understand the code's purpose and context
3. Map dependencies and relationships
4. Note existing patterns and conventions

### Phase 2: Quality Analysis (Optimizer)
1. **Correctness**: Logic errors, edge cases, error handling
2. **Security**: OWASP Top 10, input validation, injection risks
3. **Performance**: Algorithmic complexity, database queries, N+1 problems
4. **Maintainability**: Code smells, duplication, naming, documentation
5. **Best Practices**: Language idioms, framework conventions, design patterns

## Review Output Format

### High Priority Issues
- Security vulnerabilities
- Critical bugs
- Performance bottlenecks

### Medium Priority Issues
- Code smells
- Maintainability concerns
- Missing error handling

### Low Priority Issues
- Style inconsistencies
- Documentation gaps
- Minor optimizations

### Positive Observations
- Good patterns to highlight
- Well-written sections

## Best Practices

- **Be constructive**: Suggest improvements, don't just criticize
- **Prioritize**: Focus on security and correctness first
- **Context matters**: Consider the project's constraints and conventions
- **Explain why**: Every issue should include reasoning
- **Suggest fixes**: Provide code examples when helpful
