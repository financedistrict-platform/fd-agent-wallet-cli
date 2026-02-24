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
    this._currentAccessToken = null;
  }

  async connect() {
    await this.close();

    const accessToken = await this.authClient.getAccessToken();
    this._currentAccessToken = accessToken;

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

  async #ensureFreshConnection() {
    try {
      const freshToken = await this.authClient.getAccessToken();
      if (freshToken !== this._currentAccessToken) {
        logger.debug('mcp: token refreshed, reconnecting', { server: this.mcpServerUrl });
        await this.connect();
      }
    } catch (err) {
      if (isSessionExpired(err)) throw err;
      // Token retrieval failed — continue with existing connection.
      // The 401 retry will handle re-auth if needed.
    }
  }

  async callTool(toolName, args, retried = false) {
    if (!toolName) throw new Error('toolName is required');

    // Strip undefined/null entries so the server only receives provided params
    const cleanArgs = {};
    for (const [key, value] of Object.entries(args || {})) {
      if (value !== undefined && value !== null) {
        cleanArgs[key] = value;
      }
    }

    logger.debug('mcp: calling tool', { tool: toolName, args: cleanArgs });

    try {
      if (!this._client) {
        await this.connect();
      } else {
        await this.#ensureFreshConnection();
      }

      const result = await this._client.callTool({
        name: toolName,
        arguments: cleanArgs,
      });

      if (result.isError) {
        const texts = (result.content || [])
          .filter((c) => c.type === 'text' && c.text)
          .map((c) => c.text);
        const message = texts.join('\n') || 'Tool returned an error';
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
      // Session fully expired — no point retrying, user must re-authenticate
      if (isSessionExpired(error)) {
        logger.error('mcp: session expired', { tool: toolName, error: error.message });
        return {
          error: {
            code: 'SESSION_EXPIRED',
            message: error.message,
          },
        };
      }

      // Handle auth failures — reconnect with refreshed token once
      if (!retried && isAuthError(error)) {
        logger.warn('mcp: 401 on tool call, retrying after token refresh', { tool: toolName });
        try {
          await this.close();
          await this.authClient.refreshToken();
          return this.callTool(toolName, args, true);
        } catch (refreshError) {
          if (isSessionExpired(refreshError)) {
            logger.error('mcp: session expired during retry', { tool: toolName });
            return {
              error: {
                code: 'SESSION_EXPIRED',
                message: refreshError.message,
              },
            };
          }
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
      if (!this._client) {
        await this.connect();
      } else {
        await this.#ensureFreshConnection();
      }
      const result = await this._client.listTools();
      return result.tools;
    } catch (error) {
      if (isSessionExpired(error)) throw error;
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

function isSessionExpired(error) {
  return error?.code === 'SESSION_EXPIRED';
}

function isAuthError(error) {
  const msg = error?.message?.toLowerCase() || '';
  return (
    error?.code === 401 || // StreamableHTTPError stores status in .code
    error?.httpStatusCode === 401 ||
    msg.includes('unauthorized') ||
    msg.includes('401')
  );
}

module.exports = { MCPClient };
