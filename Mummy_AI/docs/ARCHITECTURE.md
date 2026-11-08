# MummyAI Architecture Notes

## Architecture goals
- Keep personal health data under backend control.
- Require authorization for every record read and write.
- Keep the language model separate from trusted application logic.
- Make AI-generated outputs distinguishable from verified records.
- Support an incremental path from demo to evaluated pilot.

## Main components
1. React client for parents and later professional users.
2. Express API for validation, authentication, authorization and domain logic.
3. Local Ollama tool-calling orchestration layer with a small allowlist of read-only prototype tools; fixed demo responses are available by setting `AI_MODE=demo`.
4. Optional MongoDB Atlas store for fictional sample child records; current record tools query only records marked `isSynthetic: true`.
5. Private document storage (planned).
6. Approved knowledge base and retrieval layer (planned).
7. Background job worker for reminders (planned).
8. Audit, monitoring, backup and incident-response processes (planned).

## AI request lifecycle
1. Accept a bounded chat message and a bounded conversation history.
2. Construct a safety-scoped prompt for the selected language.
3. Let local Ollama request a tool from the backend allowlist.
4. Validate tool arguments and reject unapproved tool names.
5. Query only explicitly synthetic MongoDB records through backend code.
6. Return the tool result to Ollama and produce a final answer.
7. Return explicit provider/database errors; never substitute fabricated record data.
8. Keep a clear disclaimer and do not treat the answer as a clinical decision.

## Important separation
The model may suggest a tool call, but backend code decides whether it is allowed. The prototype exposes capability information, clinic-question preparation, and (when Atlas is connected) read-only access to explicitly synthetic sample records. It has no authentication, reviewed knowledge source, or record write tools. The model must not have direct unrestricted database access or the ability to execute arbitrary code. By default, prompts go to the configured local Ollama service and are not sent to a hosted AI provider by this application. Real records must not be added until identity and per-record authorization are implemented and reviewed.
