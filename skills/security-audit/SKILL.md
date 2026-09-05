---
name: security-audit
description: This skill should be used when the user asks to "security audit", "find vulnerabilities", "security review", "check for security issues", or discusses security analysis.
---

# Security Vulnerability Audit Skill

Security audit using researcher and optimizer agents to identify and assess vulnerabilities.

## Overview

This skill audits security by:
1. Using the **researcher agent** to find security-critical code
2. Using the **optimizer agent** to analyze security vulnerabilities

## Workflow

### Phase 1: Security Surface Discovery (Researcher)
1. Identify authentication/authorization code
2. Find input validation points
3. Locate database queries
4. Review API endpoints
5. Check file operations
6. Find sensitive data handling

### Phase 2: Vulnerability Analysis (Optimizer)
1. **Injection**: SQL, NoSQL, Command, LDAP injection
2. **Broken Authentication**: Weak passwords, session management
3. **Sensitive Data Exposure**: Encryption, secure transmission
4. **XML External Entities**: XXE vulnerabilities
5. **Broken Access Control**: Authorization bypasses
6. **Security Misconfiguration**: Default configs, verbose errors
7. **XSS**: Cross-site scripting vulnerabilities
8. **Insecure Deserialization**: Object injection
9. **Known Vulnerabilities**: Outdated dependencies
10. **Insufficient Logging**: Security event logging

## Security Audit Output

### Vulnerabilities Found

#### Critical (CVSS 9.0-10.0)
- Immediate action required
- Exploitable remotely
- High impact

#### High (CVSS 7.0-8.9)
- Fix soon
- Significant risk

#### Medium (CVSS 4.0-6.9)
- Plan to fix
- Moderate risk

#### Low (CVSS 0.1-3.9)
- Consider fixing
- Low risk

### For Each Vulnerability
- **Type**: OWASP category
- **Location**: File and line number
- **Description**: What the vulnerability is
- **Impact**: What an attacker could do
- **Remediation**: How to fix it
- **References**: CWE/OWASP links

## OWASP Top 10 Focus Areas

1. **Injection**: Parameterized queries, input validation
2. **Broken Authentication**: Strong passwords, MFA, session security
3. **Sensitive Data Exposure**: Encryption at rest and in transit
4. **XML External Entities**: Disable external entity processing
5. **Broken Access Control**: Enforce authorization checks
6. **Security Misconfiguration**: Secure defaults, hardening
7. **XSS**: Output encoding, Content Security Policy
8. **Insecure Deserialization**: Validate serialized data
9. **Known Vulnerabilities**: Keep dependencies updated
10. **Insufficient Logging**: Log security events

## Best Practices

- **Assume breach**: Defense in depth
- **Least privilege**: Minimal permissions
- **Input validation**: Whitelist, not blacklist
- **Output encoding**: Prevent XSS
- **Parameterized queries**: Prevent SQL injection
- **Secure by default**: Opt-in, not opt-out
- **Keep updated**: Dependencies, frameworks, libraries
