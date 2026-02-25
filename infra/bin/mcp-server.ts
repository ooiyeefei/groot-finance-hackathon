#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { MCPServerStack } from '../lib/mcp-server-stack';

const app = new cdk.App();

// Deploy MCP server stack
// NOTE: Account and region should be confirmed with user before deployment
new MCPServerStack(app, 'FinansealMCPServer', {
  env: {
    account: '837224017779',
    region: 'us-west-2', // Same region as document processor for consistency
  },
  description: 'Groot Finance MCP Server for financial intelligence tools',
  tags: {
    Environment: 'production',
    Project: 'finanseal',
    Feature: 'mcp-server',
  },
});
