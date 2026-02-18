const { Client } = require('@modelcontextprotocol/sdk/client');
const {
  StreamableHTTPClientTransport,
} = require('@modelcontextprotocol/sdk/client/streamableHttp.js');

const logger = require('./utils/logger');

const CLIENT_NAME = 'fdx';
const CLIENT_VERSION = require('../package.json').version;

class MCPClient {
  constructor({ mcpServerUrl, authClient }) {
    if (!mcpServerUrl) throw new Error('mcpServerUrl is required');
    if (!authClient) throw new Error('authClient is required');

    this.mcpServerUrl = mcpServerUrl.replace(/\/$/, '');
    this.authClient = authClient;
    this._client = null;
    this._transport = null;
  }

  async connect() {
    await this.close();

    const accessToken = await this.authClient.getAccessToken();

    this._transport = new StreamableHTTPClientTransport(new URL(this.mcpServerUrl), {
      requestInit: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    });

    this._client = new Client({ name: CLIENT_NAME, version: CLIENT_VERSION }, { capabilities: {} });

    await this._client.connect(this._transport);
  }

  async callTool(toolName, args, retried = false) {
    if (!toolName) throw new Error('toolName is required');

    logger.debug('mcp: calling tool', { tool: toolName, args });

    try {
      if (!this._client) await this.connect();

      const result = await this._client.callTool({
        name: toolName,
        arguments: args || {},
      });

      if (result.isError) {
        const message = result.content?.[0]?.text || 'Tool returned an error';
        logger.warn('mcp: tool returned error', { tool: toolName, message });
        return { error: { code: 'TOOL_ERROR', message } };
      }

      for (const item of result.content || []) {
        if (item.type === 'text' && item.text) {
          try {
            logger.info('mcp: tool call succeeded', { tool: toolName });
            return { data: JSON.parse(item.text) };
          } catch {
            logger.info('mcp: tool call succeeded', { tool: toolName });
            return { data: item.text };
          }
        }
      }

      logger.info('mcp: tool call succeeded', { tool: toolName });
      return { data: result.content };
    } catch (error) {
      // Handle auth failures — reconnect with refreshed token once
      if (!retried && isAuthError(error)) {
        logger.warn('mcp: 401 on tool call, retrying after token refresh', { tool: toolName });
        try {
          await this.close();
          await this.authClient.refreshToken();
          return this.callTool(toolName, args, true);
        } catch (refreshError) {
          logger.error('mcp: token refresh failed during tool call', { tool: toolName, error: refreshError.message });
          return {
            error: {
              code: 'AUTH_REFRESH_FAILED',
              message: `Token refresh failed: ${refreshError.message}`,
            },
          };
        }
      }

      // Auth error that we already retried, or getAccessToken failed initially
      if (isAuthError(error)) {
        logger.error('mcp: authentication failed', { tool: toolName, error: error.message });
        return {
          error: {
            code: 'AUTH_ERROR',
            message: `Authentication failed: ${error.message}`,
          },
        };
      }

      const statusSuffix = error?.code > 0 ? ` (HTTP ${error.code})` : '';
      logger.error('mcp: tool call failed', { tool: toolName, code: error?.code, error: error.message });
      return {
        error: {
          code: 'REQUEST_ERROR',
          message: `${error.message}${statusSuffix}`,
        },
      };
    }
  }

  async listTools(retried = false) {
    try {
      if (!this._client) await this.connect();
      const result = await this._client.listTools();
      return result.tools;
    } catch (error) {
      if (!retried && isAuthError(error)) {
        await this.close();
        await this.authClient.refreshToken();
        return this.listTools(true);
      }
      throw error;
    }
  }

  async close() {
    try {
      await this._transport?.close();
    } catch {
      // Ignore close errors
    }
    this._client = null;
    this._transport = null;
  }
}

function isAuthError(error) {
  const msg = error?.message?.toLowerCase() || '';
  return (
    error?.code === 401 || // StreamableHTTPError stores status in .code
    error?.httpStatusCode === 401 ||
    msg.includes('unauthorized') ||
    msg.includes('401') ||
    msg.includes('no access token')
  );
}

module.exports = { MCPClient };
