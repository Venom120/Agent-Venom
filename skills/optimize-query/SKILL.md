---
name: optimize-query
description: This skill should be used when the user asks to "optimize query", "improve database performance", "slow query", "fix N+1 problem", or discusses database query optimization.
---

# Database Query Optimization Skill

Database query optimization using researcher and optimizer agents to improve query performance.

## Overview

This skill optimizes queries by:
1. Using the **researcher agent** to find and understand queries
2. Using the **optimizer agent** to analyze and optimize them

## Workflow

### Phase 1: Query Discovery (Researcher)
1. Locate slow queries (logs, monitoring, user report)
2. Understand query purpose and context
3. Identify related tables and indexes
4. Check for N+1 query patterns
5. Review query execution frequency

### Phase 2: Optimization (Optimizer)
1. **Analyze query plan**: EXPLAIN / EXPLAIN ANALYZE
2. **Identify bottlenecks**: Full table scans, missing indexes
3. **Add indexes**: On WHERE, JOIN, ORDER BY columns
4. **Optimize joins**: Join order, join types
5. **Fix N+1 problems**: Use eager loading, batch queries
6. **Query rewriting**: Subqueries to joins, etc.
7. **Measure improvement**: Before/after metrics

## Optimization Output

### Query Analysis
- Current execution time
- Query plan analysis
- Bottlenecks identified

### Recommended Indexes
```sql
CREATE INDEX idx_table_column ON table(column);
CREATE INDEX idx_table_composite ON table(col1, col2);
```

### Optimized Query
- Rewritten query
- New execution time
- Performance improvement %

### Additional Recommendations
- Caching opportunities
- Denormalization considerations
- Pagination strategies

## Best Practices

- **Measure first**: Use EXPLAIN to understand current performance
- **Index strategically**: WHERE, JOIN, ORDER BY columns
- **Avoid SELECT ***: Fetch only needed columns
- **Limit results**: Use LIMIT for large result sets
- **Fix N+1 problems**: Eager load related data
- **Consider caching**: For frequently accessed data
- **Monitor after changes**: Verify improvement in production
