/**
 * Plain text renderer — strips all formatting, returns raw text.
 */

import { MessageIR } from "./ir.js";

export function renderPlainText(ir: MessageIR): string {
    return ir.text;
}
