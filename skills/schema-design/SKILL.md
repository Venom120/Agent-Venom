---
name: schema-design
description: This skill should be used when the user asks to "design database schema", "plan database structure", "DB design for", "design tables", or discusses database architecture and relationships.
---

# Database Schema Design Skill

Database schema design using researcher and designer agents to create normalized, scalable database structures.

## Overview

This skill designs database schemas by:
1. Using the **researcher agent** to understand existing schema patterns
2. Using the **designer agent** to create the new schema

## Workflow

### Phase 1: Research (Researcher)
1. Review existing database schema
2. Identify naming conventions
3. Note relationship patterns
4. Check indexing strategies
5. Understand migration approach

### Phase 2: Design (Designer)
1. Define entities and their attributes
2. Design relationships (1:1, 1:M, M:M)
3. Normalize to appropriate form (usually 3NF)
4. Design primary keys and foreign keys
5. Plan indexes for performance
6. Define constraints (NOT NULL, UNIQUE, CHECK)
7. Create ER diagram
8. Plan migration strategy

## Schema Design Output

### Tables
```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE posts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  title VARCHAR(255) NOT NULL,
  content TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Indexes
```sql
CREATE INDEX idx_posts_user_id ON posts(user_id);
CREATE INDEX idx_posts_created_at ON posts(created_at DESC);
```

### Relationships
- **1:M**: User has many Posts
- **M:M**: Use junction tables with composite PKs

### ER Diagram
Mermaid diagram showing entities and relationships

### Migration Plan
- Order of table creation (dependencies)
- Data migration strategy
- Rollback plan

## Best Practices

- **Normalization**: Reduce redundancy, usually 3NF
- **Naming**: Consistent conventions (snake_case, plurals)
- **Primary keys**: Auto-incrementing integers or UUIDs
- **Foreign keys**: Enforce referential integrity
- **Indexes**: On foreign keys and frequently queried columns
- **Constraints**: NOT NULL, UNIQUE, CHECK for data integrity
- **Timestamps**: created_at, updated_at on most tables
