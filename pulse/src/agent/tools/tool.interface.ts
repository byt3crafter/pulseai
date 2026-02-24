/**
 * Tool interface for agent capabilities
 *
 * Tools allow the agent to perform actions and retrieve information
 * beyond simple text generation.
 */
export interface Tool {
    /** Unique identifier for the tool */
    name: string;

    /** Human-readable description of what the tool does */
    description: string;

    /** JSON Schema for tool parameters */
    parameters: {
        type: "object";
        properties: Record<string, any>;
        required?: string[];
    };

    /**
     * Execute the tool with given parameters
     *
     * @param params.tenantId - The tenant making the request
     * @param params.conversationId - The conversation context
     * @param params.args - Tool-specific arguments matching the parameters schema
     * @returns Result with text content and optional metadata
     */
    execute(params: {
        tenantId: string;
        conversationId: string;
        args: Record<string, any>;
    }): Promise<{
        result: string;
        metadata?: Record<string, any>;
    }>;
}
