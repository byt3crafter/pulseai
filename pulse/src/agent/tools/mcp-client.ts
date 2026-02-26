import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { logger } from "../../utils/logger.js";
import { Tool } from "./tool.interface.js";

// Cache of active MCP clients indexed by mcpServerId
const activeClients: Map<string, Client> = new Map();

export async function getMcpClient(serverId: string, url: string, authHeaders: Record<string, string>): Promise<Client | null> {
    if (activeClients.has(serverId)) {
        return activeClients.get(serverId)!;
    }

    try {
        logger.info({ serverId, url }, "Initializing new MCP Client connection");
        // For a SaaS gateway, we connect to remote MCP servers via SSE over HTTP/HTTPS
        // Using URL object to ensure proper formatting
        const transport = new SSEClientTransport(new URL(url), {
            requestInit: {
                headers: authHeaders
            }
        });

        const client = new Client(
            { name: "pulse-gateway", version: "1.0.0" },
            { capabilities: {} }
        );

        await client.connect(transport);
        activeClients.set(serverId, client);

        return client;
    } catch (err) {
        logger.error({ err, serverId, url }, "Failed to connect to MCP server");
        return null;
    }
}

export async function getMcpTools(serverId: string, client: Client): Promise<Tool[]> {
    try {
        const response = await client.listTools();
        return response.tools.map(t => ({
            name: `mcp_${serverId.replace(/-/g, '_')}_${t.name}`, // Prefix to avoid collisions
            description: t.description || "External MCP Tool",
            parameters: t.inputSchema as any,
            execute: async ({ args }) => {
                logger.debug({ tool: t.name, serverId }, "Executing MCP tool");
                try {
                    const result = await client.callTool({
                        name: t.name,
                        arguments: args
                    });

                    // Simple text extraction for Claude
                    const textContent = (result.content as Array<any>)
                        .filter(c => c.type === 'text')
                        .map(c => c.text)
                        .join('\n');

                    return {
                        result: textContent || "Tool executed successfully but returned no text content.",
                        metadata: { isError: result.isError }
                    };
                } catch (err: any) {
                    logger.error({ err, tool: t.name }, "MCP Tool execution failed");
                    return { result: `Error executing MCP tool: ${err.message}` };
                }
            }
        }));
    } catch (err) {
        logger.error({ err, serverId }, "Failed to list tools from MCP server");
        return [];
    }
}
