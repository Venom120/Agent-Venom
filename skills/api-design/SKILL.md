---
name: api-design
description: This skill should be used when the user asks to "design an API", "plan API endpoints", "API structure for", "REST API design", or discusses creating or planning API architecture.
---

# API Design Skill

RESTful API design using researcher and designer agents to create well-structured, scalable API specifications.

## Overview

This skill designs APIs by:
1. Using the **researcher agent** to understand existing API patterns in the project
2. Using the **designer agent** to create the new API specification

## Workflow

### Phase 1: Research (Researcher)
1. Identify existing API patterns and conventions
2. Understand authentication/authorization approach
3. Note error response formats
4. Check pagination patterns
5. Review existing endpoint structures

### Phase 2: Design (Designer)
1. Define resource models and relationships
2. Design endpoint URLs (RESTful conventions)
3. Specify HTTP methods (GET/POST/PUT/PATCH/DELETE)
4. Design request/response formats
5. Define error responses and status codes
6. Plan authentication and authorization
7. Design pagination and filtering
8. Create API documentation structure

## API Design Output

### Endpoints
```
GET    /api/resource          - List all resources
POST   /api/resource          - Create new resource
GET    /api/resource/:id      - Get single resource
PUT    /api/resource/:id      - Replace resource
PATCH  /api/resource/:id      - Update resource
DELETE /api/resource/:id      - Delete resource
```

### Request Format
- Headers (Content-Type, Authorization)
- Body schema (JSON)
- Query parameters (filters, pagination)

### Response Format
- Success responses (200, 201, 204)
- Error responses (400, 401, 403, 404, 500)
- Pagination metadata

### Security
- Authentication method
- Authorization rules
- Rate limiting
- Input validation

## Best Practices

- **RESTful conventions**: Use standard HTTP methods and status codes
- **Consistent naming**: Plural nouns for collections, clear resource names
- **Versioning**: Plan for API evolution (/api/v1/)
- **Documentation**: OpenAPI/Swagger specification
- **Error handling**: Consistent error response format
- **Pagination**: For list endpoints that could return many items
