# FinanSEAL AI Chat Agent Documentation

This directory contains comprehensive documentation for the FinanSEAL LangGraph-based AI Chat Agent system that was refactored and optimized in January 2025.

## Quick Navigation

- [**Architecture Overview**](./01-architecture-overview.md) - System design and component relationships
- [**Agent Flow**](./02-agent-flow.md) - Complete conversation flow and phase management
- [**Security Model**](./03-security-model.md) - Authentication, validation, and RLS enforcement
- [**Tool System**](./04-tool-system.md) - Self-describing tools and dynamic schema generation
- [**Router Logic**](./05-router-logic.md) - Intelligent routing and circuit breaker patterns
- [**Performance Optimizations**](./06-performance-optimizations.md) - Database, memory, and query improvements
- [**API Integration**](./07-api-integration.md) - Chat API and conversation management
- [**Troubleshooting**](./08-troubleshooting.md) - Common issues and debugging guide

## System Overview

The FinanSEAL AI Chat Agent is a security-first, LangGraph-based conversational AI system designed specifically for Southeast Asian SME financial queries. It features:

### 🔒 **Security-First Architecture**
- Mandatory user context validation
- Row Level Security (RLS) enforcement
- PII protection and secure logging
- Multi-layer authentication validation

### 🎯 **Intelligent Processing**
- LLM-powered intent analysis and clarification
- Multi-language support (English, Thai, Indonesian)
- Topic guardrails and off-topic handling
- Smart circuit breaker protection

### 🛠 **Self-Describing Tool System**
- Dynamic OpenAI function schema generation
- Tool factory registry pattern
- Automatic validation and security enforcement
- Extensible architecture for new tools

### ⚡ **Performance Optimized**
- Database query optimization with composite indexes
- Memory management and citation cleanup
- Efficient conversation context handling
- Circuit breaker patterns for reliability

## Recent Refactoring (January 2025)

This agent system underwent comprehensive refactoring to address:

1. **Security Issues**: PII logging, API key handling, memory leaks
2. **Code Quality**: Method extraction, complexity reduction, maintainability
3. **Performance**: Database optimization, query efficiency, memory management
4. **Architecture**: Circuit breaker simplification, unified validation

The result is a production-ready, secure, and maintainable conversational AI system.

## Getting Started

1. Start with [Architecture Overview](./01-architecture-overview.md) to understand the system design
2. Review [Agent Flow](./02-agent-flow.md) to understand conversation processing
3. Check [Security Model](./03-security-model.md) for authentication requirements
4. Explore [Tool System](./04-tool-system.md) for extending functionality

## File Structure

```
src/lib/
├── agent/                          # Core LangGraph agent system
│   ├── types.ts                   # AgentState and intent definitions
│   ├── router.ts                  # Intelligent routing with circuit breakers
│   └── nodes/                     # Processing node implementations
│       ├── validation-node.ts     # Security validation and auth
│       ├── intent-node.ts         # LLM-powered intent analysis
│       ├── clarification-node.ts  # User clarification handling
│       ├── model-node.ts          # LLM interaction and tool calling
│       ├── tool-nodes.ts          # Tool execution and error handling
│       └── guardrail-nodes.ts     # Topic validation and off-topic handling
├── tools/                         # Self-describing tool system
│   ├── base-tool.ts              # Security-first abstract base class
│   ├── tool-factory.ts           # Registry and dynamic schema generation
│   ├── transaction-lookup-tool.ts # Financial transaction queries
│   └── document-search-tool.ts    # Document and regulatory search
├── langgraph-agent.ts            # Main agent factory and state creation
└── config/
    └── ai-config.ts              # LLM configuration and endpoints
```

## Support

For technical questions about the agent system:
1. Check the [Troubleshooting Guide](./08-troubleshooting.md)
2. Review relevant component documentation
3. Examine the codebase with security and performance considerations in mind

---

*Last updated: January 2025 - Post-refactoring documentation*