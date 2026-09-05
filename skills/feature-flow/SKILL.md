---
name: feature-flow
description: This skill should be used when the user asks to "plan feature", "design new feature", "feature workflow", "end-to-end feature", or discusses planning complete features from design to testing.
---

# End-to-End Feature Planning Skill

Complete feature planning using designer, implementer, and tester agents to create comprehensive feature specifications.

## Overview

This skill plans features by:
1. Using the **designer agent** to plan architecture and design
2. Using the **implementer agent** to estimate implementation
3. Using the **tester agent** to plan testing strategy

## Workflow

### Phase 1: Feature Design (Designer)
1. **Requirements**: What the feature should do
2. **User flows**: Step-by-step user interactions
3. **API design**: Endpoints needed
4. **Database schema**: New tables or changes
5. **UI mockups**: Interface design (if applicable)
6. **Architecture**: Components and interactions
7. **Sequence diagrams**: Flow visualization

### Phase 2: Implementation Planning (Implementer)
1. **Break down work**: Tasks and subtasks
2. **Estimate effort**: Time for each task
3. **Identify dependencies**: What needs to be done first
4. **Note risks**: Technical challenges
5. **List libraries**: New dependencies needed

### Phase 3: Test Strategy (Tester)
1. **Unit tests**: What functions to test
2. **Integration tests**: Component interactions
3. **E2E tests**: Full user workflows
4. **Test data**: Setup needed
5. **Edge cases**: Scenarios to cover

## Feature Plan Output

### 1. Feature Overview
- Name and description
- User stories
- Success criteria

### 2. Design Specification
- User flows
- API endpoints
- Database schema changes
- UI mockups
- Sequence diagrams

### 3. Implementation Plan
- Task breakdown
- Effort estimates
- Dependencies
- Technical risks
- Required libraries

### 4. Testing Strategy
- Unit test list
- Integration test scenarios
- E2E test workflows
- Test data requirements
- Edge cases to cover

### 5. Deployment Considerations
- Database migrations
- Feature flags
- Rollback plan
- Monitoring

## Best Practices

- **Start with user needs**: Why this feature matters
- **Design first**: Don't jump to coding
- **Break it down**: Small, manageable tasks
- **Consider edge cases**: Don't just plan the happy path
- **Plan for failure**: Error handling, rollback
- **Testing from start**: Don't make it an afterthought
- **Document decisions**: Why you chose this approach
