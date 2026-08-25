/**
 * Human, present-tense labels for tool calls, shown as desk captions.
 *
 * ⚠ MIRRORED CODE — this is a copy of `toolStepLabel()` in
 * `pulse/src/agent/runtime.ts`. It is duplicated for the same reason
 * `dashboard/src/storage/schema.ts` is: the dashboard is a separate package and
 * cannot import from the gateway.
 *
 * If you add a tool label in runtime.ts, add it here too, or the floor will
 * caption the new tool with its raw snake_case name.
 */

const MAP: Record<string, string> = {
    web_search: "Searching the web",
    web_fetch: "Reading a page",
    email_send: "Sending email", email_reply: "Replying to email", email_draft: "Drafting email",
    email_search: "Searching email", email_read: "Reading email", email_list: "Checking the inbox",
    email_fetch_unread: "Checking unread email",
    contact_lookup: "Looking up a contact", contact_list: "Reading contacts", contact_save: "Saving a contact",
    calendar_add: "Adding a calendar event", calendar_list: "Checking the calendar", calendar_search: "Searching the calendar",
    memory_search: "Recalling memory", memory_store: "Saving to memory",
    note_save: "Saving a note", todo_add: "Adding a to-do", task_create: "Creating a task", task_update: "Updating a task",
    document_search: "Searching documents", document_read: "Reading a document", pdf_read: "Reading a PDF", pdf_fill_form: "Filling a PDF",
    expense_add: "Logging an expense", commitment_create: "Setting a follow-up",
    python_execute: "Running a calculation", exec: "Running a command", bash_sandbox: "Running code",
    schedule_job: "Scheduling a job", notify: "Sending a notification",
    erpnext_create: "Creating in ERPNext", erpnext_update: "Updating ERPNext", erpnext_read: "Reading ERPNext",
    erpnext_list: "Querying ERPNext", erpnext_method: "Calling ERPNext",
    browser_navigate: "Opening a page", browser_click: "Clicking", browser_fill: "Filling a form", browser_extract: "Reading the page",
    server_exec: "Running a server command", server_list: "Listing servers", server_read: "Checking a server",
    pulse_help: "Checking what's set up", activity_log: "Checking the activity log",
    get_current_time: "Checking the time", calculator: "Calculating",
};

export function toolStepLabel(name: string): string {
    if (MAP[name]) return MAP[name];
    if (name.startsWith("server")) return "Working on a server";
    if (name.startsWith("erpnext")) return "Working in ERPNext";
    if (name.startsWith("email")) return "Working with email";
    if (name.startsWith("browser")) return "Using the browser";
    const words = name.replace(/_/g, " ");
    return words.charAt(0).toUpperCase() + words.slice(1);
}
