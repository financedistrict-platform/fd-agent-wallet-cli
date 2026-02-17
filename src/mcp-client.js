const axios = require('axios');

class MCPClient {
  #requestId = 0;

  constructor({ mcpServerUrl, authClient, httpClient }) {
    if (!mcpServerUrl) throw new Error('mcpServerUrl is required');
    if (!authClient) throw new Error('authClient is required');

    this.mcpServerUrl = mcpServerUrl.replace(/\/$/, '');
    this.authClient = authClient;
    this.httpClient = httpClient || axios.create();
  }

  async callTool(toolName, args, retried = false) {
    if (!toolName) throw new Error('toolName is required');

    const arguments_ = args || {};

    const payload = {
      jsonrpc: '2.0',
      id: ++this.#requestId,
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: arguments_,
      },
    };

    let accessToken;
    try {
      accessToken = await this.authClient.getAccessToken();
    } catch (error) {
      return {
        error: {
          code: 'AUTH_ERROR',
          message: `Failed to get access token: ${error.message}`,
        },
      };
    }

    try {
      const response = await this.httpClient.post(this.mcpServerUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        timeout: 45000,
      });

      let responseData = response.data;

      if (typeof responseData === 'string' && responseData.startsWith('event: message')) {
        for (const line of responseData.split('\n')) {
          if (line.startsWith('data: ')) {
            responseData = JSON.parse(line.substring(6));
            break;
          }
        }
      }

      if (responseData.error) {
        return { error: responseData.error };
      }

      if (responseData.result?.content) {
        for (const contentItem of responseData.result.content) {
          if (contentItem.type === 'text' && contentItem.text) {
            try {
              return { data: JSON.parse(contentItem.text) };
            } catch {
              return { data: contentItem.text };
            }
          }
        }
      }

      return { data: responseData };
    } catch (error) {
      if (error.response?.status === 401 && !retried) {
        try {
          await this.authClient.refreshToken();
          return this.callTool(toolName, arguments_, true);
        } catch (refreshError) {
          return {
            error: {
              code: 'AUTH_REFRESH_FAILED',
              message: `Token refresh failed: ${refreshError.message}`,
            },
          };
        }
      }

      return {
        error: {
          code: 'REQUEST_ERROR',
          message: error.response?.data?.message || error.message,
          details: error.response?.data,
        },
      };
    }
  }
}

module.exports = { MCPClient };
